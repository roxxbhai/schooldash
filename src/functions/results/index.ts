import 'server-only';
import { teachesClass } from '@/functions/authorization';
import { studentEligibilityIssues } from '@/functions/enrollments';
import { findExamSubject } from '@/functions/exam-subjects';
import { forbidden, validationError } from '@/helpers/api-error';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { unwrapReference } from '@/helpers/school-validation';
import type { ValidationIssue } from '@/types/api';
import type { AppUser } from '@/types/auth';
import type { ExamSubject } from '@/types/exam-subjects';
import type { FunctionResult } from '@/types/function-result';
import type { MarkEntry } from '@/types/results';
import type { DbClient } from '@/types/supabase';

/**
 * MARKS RULES SHARED BY SINGLE ENTRY, BULK ENTRY AND CORRECTIONS.
 * ADMINS MAY WRITE ANY PAPER; TEACHERS ONLY PAPERS WHOSE CLASS AND SUBJECT THEY
 * ARE ASSIGNED TO (A CLASS TEACHER WITHOUT THE SUBJECT CANNOT); STUDENTS NEVER.
 */

const NOT_YOUR_PAPER = 'You can only enter marks for subjects you teach in that class.';

/** THE ACTOR MAY WRITE MARKS FOR THIS PAPER (ADMIN, OR TEACHER OF ITS CLASS AND SUBJECT). */
export async function requirePaperWriter(client: DbClient, actor: AppUser, paper: ExamSubject): Promise<FunctionResult<null>> {
  try {
    if (actor.role === 'ADMIN') return functionSuccess(null);
    if (actor.role !== 'TEACHER') throw forbidden();
    const isAssigned = unwrapResult(await teachesClass(client, actor, { classId: paper.classId, subjectId: paper.subjectId }));
    if (!isAssigned) throw forbidden(NOT_YOUR_PAPER);
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'results.authorizePaper');
  }
}

/**
 * THE PAPER A NEW MARK TARGETS, ONCE THE ACTOR IS ALLOWED TO WRITE IT. ADMINS
 * SEE EVERY PAPER, SO A MISSING ONE IS A 422 ON examSubjectId. FOR TEACHERS RLS
 * HIDES PAPERS OF CLASSES THEY DON'T TEACH: THAT IS A 403 — THE SAME ANSWER
 * WHETHER OR NOT THE PAPER EXISTS, SO EXISTENCE IS NOT REVEALED.
 */
export async function findPaperForWrite(client: DbClient, examSubjectId: string, actor: AppUser): Promise<FunctionResult<ExamSubject>> {
  try {
    const lookup = await findExamSubject(client, examSubjectId);
    if (!lookup.success && lookup.data.status === 404 && actor.role !== 'ADMIN') throw forbidden(NOT_YOUR_PAPER);
    const paper = unwrapReference(lookup, 'examSubjectId', 'Exam subject not found.');
    unwrapResult(await requirePaperWriter(client, actor, paper));
    return functionSuccess(paper);
  } catch (error) {
    return functionFailure(error, 'results.findPaperForWrite');
  }
}

/**
 * EVERY MARK MUST BE WITHIN 0–maxMarks AND EVERY STUDENT ACTIVE AND ENROLLED IN
 * THE PAPER'S CLASS. ALL PROBLEMS ARE REPORTED TOGETHER (422); `fieldPrefix` IS
 * 'RECORDS.' FOR BULK SUBMISSIONS SO EACH ISSUE NAMES ITS RECORD BY INDEX.
 */
export async function validateMarks(
  client: DbClient,
  paper: ExamSubject,
  entries: MarkEntry[],
  isBulk: boolean,
): Promise<FunctionResult<null>> {
  try {
    function fieldPath(index: number, field: string) {
      return isBulk ? `records.${index}.${field}` : field;
    }
    const studentIds = entries.map((entry) => entry.studentId);
    const studentPaths = entries.map((_entry, index) => fieldPath(index, 'studentId'));
    const eligibilityIssues = unwrapResult(
      await studentEligibilityIssues(client, paper.classId, studentIds, studentPaths, "The student is not enrolled in the exam subject's class."),
    );

    // ISSUES ARE LISTED PER RECORD: ITS MARK FIRST, THEN ITS STUDENT.
    const issues: ValidationIssue[] = [];
    entries.forEach((entry, index) => {
      if (entry.marksObtained > paper.maxMarks) {
        issues.push({ path: fieldPath(index, 'marksObtained'), message: `marksObtained must not exceed maxMarks (${paper.maxMarks}).` });
      }
      issues.push(...eligibilityIssues.filter((issue) => issue.path === studentPaths[index]));
    });
    if (issues.length > 0) throw validationError(issues);
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'results.validateMarks');
  }
}
