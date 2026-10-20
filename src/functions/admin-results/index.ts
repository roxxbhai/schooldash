import 'client-only';
import { CORRECTION_CONCURRENCY, MARKS_MESSAGES } from '@/constants/admin-results';
import { API_PATHS } from '@/constants/api-client';
import { loadClassRoster } from '@/functions/admin-enrollments';
import { apiRequest, fetchAllPages, updateRecord } from '@/functions/api-client';
import { recordIndex } from '@/helpers/admin-results';
import { networkFailure } from '@/helpers/api-client';
import type { MarkCorrection, MarksSaveOutcome, MarksSheet, NewMark } from '@/types/admin-results';
import type { ApiResult } from '@/types/api-client';
import type { Result } from '@/types/results';

/**
 * THE CLASS ROSTER (ROLL NUMBER, THEN NAME) WITH EACH STUDENT'S SAVED MARK FOR
 * ONE PAPER. ALL THREE LISTS ARE BOUNDED BY THE CLASS SIZE.
 */
export async function loadMarksSheet(paper: { id: string; classId: string }): Promise<ApiResult<MarksSheet>> {
  try {
    const [roster, results] = await Promise.all([loadClassRoster(paper.classId), fetchAllPages<Result>(API_PATHS.results, { examSubjectId: paper.id })]);
    if (!roster.success) return roster;
    if (!results.success) return results;

    const resultByStudentId = new Map(results.data.map((result) => [result.studentId, result]));
    const rows = roster.data.map((row) => ({ ...row, result: resultByStudentId.get(row.enrollment.studentId) ?? null }));
    return { success: true, message: 'Operation successful', data: { paperId: paper.id, rows } };
  } catch {
    return networkFailure();
  }
}

/**
 * NEW MARKS IN ONE ALL-OR-NOTHING BULK REQUEST. VALIDATION ISSUES NAME RECORDS BY
 * INDEX, WHICH ARE MAPPED BACK TO STUDENTS.
 */
async function enterNewMarks(examSubjectId: string, newMarks: NewMark[]): Promise<ApiResult<MarksSaveOutcome>> {
  try {
    const outcome: MarksSaveOutcome = { saved: [], rowErrors: {}, conflictedStudentIds: [], formError: null };
    if (newMarks.length === 0) return { success: true, message: 'Operation successful', data: outcome };

    const result = await apiRequest<{ items: Result[]; count: number }>(`${API_PATHS.results}/bulk`, {
      method: 'POST',
      body: {
        examSubjectId,
        records: newMarks.map((mark) => ({ studentId: mark.studentId, marksObtained: mark.marksObtained, ...(mark.remarks ? { remarks: mark.remarks } : {}) })),
      },
    });
    if (result.success) return { success: true, message: 'Operation successful', data: { ...outcome, saved: result.data.items } };

    let isEveryIssueOnARow = result.data.details.length > 0;
    for (const issue of result.data.details) {
      const index = recordIndex(issue.path);
      const studentId = index === null ? undefined : newMarks[index]?.studentId;
      if (!studentId) {
        isEveryIssueOnARow = false;
        continue;
      }
      outcome.rowErrors[studentId] ??= issue.message;
    }
    const count = newMarks.length;
    outcome.formError = isEveryIssueOnARow
      ? `None of the ${count === 1 ? 'new mark was' : `${count} new marks were`} saved, because new marks are saved together. Fix the rows marked Error and save again.`
      : `None of the new marks were saved. ${result.message}`;
    return { success: true, message: 'Operation successful', data: outcome };
  } catch {
    return networkFailure();
  }
}

/** CORRECTIONS AS SEPARATE PATCHES, A FEW AT A TIME. EACH ONE SUCCEEDS OR FAILS ON ITS OWN. */
async function correctMarks(corrections: MarkCorrection[]): Promise<ApiResult<MarksSaveOutcome>> {
  try {
    const outcome: MarksSaveOutcome = { saved: [], rowErrors: {}, conflictedStudentIds: [], formError: null };
    let next = 0;

    async function worker() {
      while (next < corrections.length) {
        const correction = corrections[next];
        next += 1;
        const { result: saved, marksObtained, remarks } = correction;
        // SENT ONLY IF THE MARK IS STILL THE VERSION LAST READ (OPTIMISTIC CONCURRENCY; 409 OTHERWISE).
        const result = await updateRecord<Result>(API_PATHS.results, saved.id, {
          ...(marksObtained === undefined ? {} : { marksObtained }),
          ...(remarks === undefined ? {} : { remarks }),
          expectedUpdatedAt: saved.updatedAt,
        });
        if (result.success) {
          outcome.saved.push(result.data);
          continue;
        }
        if (result.data.status === 409) {
          outcome.rowErrors[correction.studentId] = MARKS_MESSAGES.conflict;
          outcome.conflictedStudentIds.push(correction.studentId);
          continue;
        }
        outcome.rowErrors[correction.studentId] = result.data.details[0]?.message ?? result.message;
      }
    }

    await Promise.all(Array.from({ length: Math.min(CORRECTION_CONCURRENCY, corrections.length) }, () => worker()));
    return { success: true, message: 'Operation successful', data: outcome };
  } catch {
    return networkFailure();
  }
}

/**
 * SAVES A MARKS SHEET: NEW MARKS IN ONE BULK REQUEST, CORRECTIONS AS PATCHES.
 * SUCCEEDS WHENEVER IT RAN; WHAT WAS AND WASN'T SAVED IS IN THE OUTCOME.
 */
export async function saveMarks(input: { examSubjectId: string; newMarks: NewMark[]; corrections: MarkCorrection[] }): Promise<ApiResult<MarksSaveOutcome>> {
  try {
    const [enteredResult, correctedResult] = await Promise.all([enterNewMarks(input.examSubjectId, input.newMarks), correctMarks(input.corrections)]);
    if (!enteredResult.success) return enteredResult;
    if (!correctedResult.success) return correctedResult;
    const entered = enteredResult.data;
    const corrected = correctedResult.data;
    const failedCorrections = Object.keys(corrected.rowErrors).length;
    const correctionsError =
      failedCorrections > 0
        ? `${failedCorrections === 1 ? '1 correction was' : `${failedCorrections} corrections were`} not saved. See the rows marked Error.`
        : null;
    return {
      success: true,
      message: 'Operation successful',
      data: {
        saved: [...entered.saved, ...corrected.saved],
        rowErrors: { ...entered.rowErrors, ...corrected.rowErrors },
        conflictedStudentIds: corrected.conflictedStudentIds,
        formError: [entered.formError, correctionsError].filter(Boolean).join(' ') || null,
      },
    };
  } catch {
    return networkFailure();
  }
}
