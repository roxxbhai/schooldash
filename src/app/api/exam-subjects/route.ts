import { z } from 'zod';
import { EXAM_SUBJECT_COLUMNS, EXAM_SUBJECT_ERRORS, MAX_MARKS_SCHEMA, PASS_MARKS_SCHEMA } from '@/constants/exam-subjects';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { validateExamDate } from '@/functions/exam-subjects';
import { findExam } from '@/functions/exams';
import { validationError } from '@/helpers/api-error';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { ExamSubject } from '@/types/exam-subjects';

/**
 * EXAM PAPERS: A SUBJECT CONFIGURED FOR AN EXAM AND A CLASS.
 * - READ: RLS-SCOPED. WRITE: ADMINS.
 * - THE CLASS MUST BE IN THE EXAM'S ACADEMIC YEAR; THE YEAR ALWAYS COMES FROM THE
 *   EXAM. EXAM, CLASS AND SUBJECT ARE FIXED AT CREATION (COLUMN GRANTS), SO
 *   EXISTING RESULTS CAN NEVER BE RELABELLED. PAPERS ARE NEVER DELETED.
 * - maxMarks > 0; OPTIONAL 0 ≤ passMarks ≤ maxMarks; ONE PAPER PER EXAM + CLASS + SUBJECT (409).
 */

const createExamSubjectSchema = z
  .strictObject({
    examId: uuidSchema,
    classId: uuidSchema,
    subjectId: uuidSchema,
    maxMarks: MAX_MARKS_SCHEMA,
    passMarks: PASS_MARKS_SCHEMA,
    examDate: z.iso.date().optional(),
  })
  .refine((paper) => paper.passMarks == null || paper.passMarks <= paper.maxMarks, {
    path: ['passMarks'],
    message: 'passMarks must be between 0 and maxMarks.',
  });
const listExamSubjectsQuerySchema = z.object({
  examId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
});

/** RLS-SCOPED: ADMINS ALL, TEACHERS CLASSES THEY TEACH, STUDENTS THEIR CLASS. ?examId= ?classId= ?subjectId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listExamSubjectsQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('examSubjects').select(EXAM_SUBJECT_COLUMNS, { count: 'exact' });
  if (filters.examId) query = query.eq('examId', filters.examId);
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.subjectId) query = query.eq('subjectId', filters.subjectId);
  const rows = query.order('examId').order('classId').order('subjectId').order('id').range(pagination.from, pagination.to);
  return paginated(await page<ExamSubject>('examSubjects.list', rows, pagination, EXAM_SUBJECT_ERRORS));
});

/** ADMIN ONLY. { examId, classId, subjectId, maxMarks, passMarks?, examDate? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const paper = await parseJsonBody(request, createExamSubjectSchema);
  const exam = unwrapReference(await findExam(supabase, paper.examId), 'examId', 'Exam not found.');
  const schoolClass = unwrapReference(await findClass(supabase, paper.classId), 'classId', 'Class not found.');
  if (schoolClass.academicYearId !== exam.academicYearId) {
    throw validationError([{ path: 'classId', message: "The class is not in the exam's academic year." }]);
  }
  unwrapResult(await validateExamDate(supabase, exam, paper.examDate));

  const query = supabase
    .from('examSubjects')
    .insert({ ...paper, academicYearId: exam.academicYearId })
    .select(EXAM_SUBJECT_COLUMNS)
    .maybeSingle();
  return created(await one<ExamSubject>('examSubjects.insert', query, EXAM_SUBJECT_ERRORS));
});
