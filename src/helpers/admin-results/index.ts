import { MARKS_MESSAGES, MAX_REMARKS_LENGTH } from '@/constants/admin-results';
import { marksTextIssue, marksToText, parseMarks } from '@/helpers/marks';
import type { MarkCorrection, MarkDraft, MarksSheetRow, NewMark } from '@/types/admin-results';
import type { Result } from '@/types/results';

/** "records.2.marksObtained" → 2; ANY OTHER PATH → NULL. */
export function recordIndex(path: string): number | null {
  const match = /^records\.(\d+)\./.exec(path);
  return match ? Number(match[1]) : null;
}

/** WHAT A ROW SHOWS BEFORE ANY EDIT: ITS SAVED MARK AND REMARKS, OR BLANK. */
export function savedDraft(result: Result | null): MarkDraft {
  return { marks: marksToText(result?.marksObtained), remarks: result?.remarks ?? '' };
}

/** WHY A ROW'S DRAFT CAN'T BE SAVED AS TYPED, OR NULL. A BLANK MARK FOR A NEW ROW SIMPLY MEANS "NOT ENTERED". */
export function draftIssue(draft: MarkDraft, result: Result | null, maxMarks: number): string | null {
  const marksIssue = marksTextIssue(draft.marks, maxMarks);
  if (marksIssue) return marksIssue;
  if (draft.remarks.trim().length > MAX_REMARKS_LENGTH) return MARKS_MESSAGES.remarksTooLong;
  if (draft.marks.trim() !== '') return null;
  if (result) return MARKS_MESSAGES.cannotClear;
  return draft.remarks.trim() ? MARKS_MESSAGES.remarksNeedMark : null;
}

/** TRUE WHEN THE DRAFT DIFFERS FROM WHAT IS SAVED (A BLANK NEW ROW IS NOT A CHANGE). */
export function isDraftChanged(draft: MarkDraft, result: Result | null): boolean {
  const saved = savedDraft(result);
  const isMarksChanged = parseMarks(draft.marks) !== parseMarks(saved.marks) || (draft.marks.trim() === '') !== (saved.marks === '');
  return isMarksChanged || draft.remarks.trim() !== saved.remarks.trim();
}

/** THE NEWER OF TWO VERSIONS OF A RESULT (BY updatedAt), SO A JUST-SAVED MARK ISN'T REPLACED BY A STALE LIST. */
export function newerResult(first: Result | null, second: Result | null | undefined): Result | null {
  if (!second) return first;
  if (!first) return second;
  return Date.parse(second.updatedAt) > Date.parse(first.updatedAt) ? second : first;
}

/**
 * SPLITS THE CHANGED, VALID ROWS INTO NEW MARKS (BULK) AND CORRECTIONS (PATCH,
 * WITH ONLY THE FIELDS THAT CHANGED). ROWS WITH AN ISSUE ARE LEFT OUT.
 */
export function marksToSave(rows: { row: MarksSheetRow; draft: MarkDraft; isChanged: boolean; issue: string | null }[]) {
  const newMarks: NewMark[] = [];
  const corrections: MarkCorrection[] = [];
  for (const { row, draft, isChanged, issue } of rows) {
    const marks = parseMarks(draft.marks);
    if (!isChanged || issue || marks === null) continue;
    const remarks = draft.remarks.trim() || null;
    const studentId = row.enrollment.studentId;
    if (!row.result) {
      newMarks.push({ studentId, marksObtained: marks, remarks });
      continue;
    }
    const isMarksChanged = marks !== Number(row.result.marksObtained);
    const isRemarksChanged = remarks !== (row.result.remarks?.trim() || null);
    corrections.push({
      studentId,
      result: row.result,
      ...(isMarksChanged ? { marksObtained: marks } : {}),
      ...(isRemarksChanged ? { remarks } : {}),
    });
  }
  return { newMarks, corrections };
}
