import 'server-only';
import { EXAM_SUBJECT_COLUMNS, EXAM_SUBJECT_ERRORS } from '@/constants/exam-subjects';
import { findAcademicYear } from '@/functions/academic-years';
import { validationError } from '@/helpers/api-error';
import { many, one } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import type { ExamPaperWithSubject, ExamSubject } from '@/types/exam-subjects';
import type { Exam } from '@/types/exams';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE EXAM PAPER, AS THE CALLER MAY SEE IT (RLS: ADMINS ALL, TEACHERS CLASSES THEY TEACH, STUDENTS THEIR CLASS). */
export async function findExamSubject(client: DbClient, id: string): Promise<FunctionResult<ExamSubject>> {
  try {
    const query = client.from('examSubjects').select(EXAM_SUBJECT_COLUMNS).eq('id', id).maybeSingle();
    return functionSuccess(await one<ExamSubject>('examSubjects.get', query, EXAM_SUBJECT_ERRORS));
  } catch (error) {
    return functionFailure(error, 'examSubjects.get');
  }
}

/** THE PAPERS OF ONE EXAM FOR ONE CLASS, WITH SUBJECT CODE AND NAME. */
export async function papersForClass(client: DbClient, examId: string, classId: string): Promise<FunctionResult<ExamPaperWithSubject[]>> {
  try {
    const query = client
      .from('examSubjects')
      .select(`${EXAM_SUBJECT_COLUMNS}, subject:subjects!examSubjects_subjectId_fkey(code, name)`)
      .eq('examId', examId)
      .eq('classId', classId)
      .overrideTypes<ExamPaperWithSubject[], { merge: false }>();
    return functionSuccess(await many<ExamPaperWithSubject>('examSubjects.forClass', query, EXAM_SUBJECT_ERRORS));
  } catch (error) {
    return functionFailure(error, 'examSubjects.forClass');
  }
}

async function academicYearWindow(client: DbClient, academicYearId: string) {
  const year = unwrapResult(await findAcademicYear(client, academicYearId));
  return { start: year.startDate, end: year.endDate, label: "the exam's academic year" };
}

/** A PAPER'S DATE MUST FALL WITHIN THE EXAM'S DATES — OR, IF THE EXAM HAS NONE, ITS ACADEMIC YEAR (422). */
export async function validateExamDate(client: DbClient, exam: Exam, examDate: string | null | undefined): Promise<FunctionResult<null>> {
  try {
    if (!examDate) return functionSuccess(null);
    const window =
      exam.startDate && exam.endDate
        ? { start: exam.startDate, end: exam.endDate, label: "the exam's dates" }
        : await academicYearWindow(client, exam.academicYearId);
    if (examDate < window.start || examDate > window.end) {
      throw validationError([{ path: 'examDate', message: `examDate must be within ${window.label}.` }]);
    }
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'examSubjects.validateDate');
  }
}
