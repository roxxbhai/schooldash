import { z } from 'zod';
import { MARK_FIELDS, RESULT_COLUMNS, RESULT_ERRORS } from '@/constants/results';
import { requireAuthenticatedUser, requireRole, requireStudentOwnership } from '@/functions/authorization';
import { findPaperForWrite, validateMarks } from '@/functions/results';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Result } from '@/types/results';

/**
 * RESULTS: A STUDENT'S MARK FOR ONE EXAM PAPER (EXAM × CLASS × SUBJECT).
 * - ADMINS: ENTER, CORRECT AND READ ANY MARKS. TEACHERS: ONLY PAPERS WHOSE CLASS
 *   AND SUBJECT THEY TEACH. STUDENTS: READ THEIR OWN ONLY; NEVER WRITE.
 * - THE STUDENT MUST BE ACTIVE AND ENROLLED IN THE PAPER'S CLASS (THE CLASS IS
 *   ALWAYS TAKEN FROM THE PAPER); 0 ≤ marksObtained ≤ maxMarks, TWO DECIMALS AT
 *   MOST; ONE RESULT PER STUDENT PER PAPER (409); enteredByUserId IS THE ACTOR.
 * - THERE IS NO "ABSENT" STATE: A MISSING MARK IS A RESULT NOT YET ENTERED.
 */

const createResultSchema = z.strictObject({ examSubjectId: uuidSchema, studentId: uuidSchema, ...MARK_FIELDS });
const listResultsQuerySchema = z.object({
  examId: uuidSchema.optional(),
  examSubjectId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
});

/** RLS-SCOPED: ADMINS ALL, TEACHERS THEIR PAPERS, STUDENTS THEIR OWN (ANOTHER studentId → 403). ?examId= ?examSubjectId= ?classId= ?subjectId= ?studentId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listResultsQuerySchema);
  const pagination = getPagination(searchParams);
  if (viewer.role === 'STUDENT' && filters.studentId) unwrapResult(await requireStudentOwnership(supabase, filters.studentId));

  const isPaperFiltered = Boolean(filters.examId || filters.subjectId);
  // EMPTY EMBED: FILTERS BY THE PAPER'S EXAM/SUBJECT WITHOUT CHANGING THE RESPONSE SHAPE.
  const columns = isPaperFiltered ? `${RESULT_COLUMNS}, paper:examSubjects!resultsExamSubjectFkey!inner()` : RESULT_COLUMNS;
  let query = supabase.from('results').select(columns, { count: 'exact' });
  if (filters.examSubjectId) query = query.eq('examSubjectId', filters.examSubjectId);
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.studentId) query = query.eq('studentId', filters.studentId);
  if (filters.examId) query = query.eq('paper.examId', filters.examId);
  if (filters.subjectId) query = query.eq('paper.subjectId', filters.subjectId);
  const rows = query.order('examSubjectId').order('studentId').order('id').range(pagination.from, pagination.to).overrideTypes<Result[], { merge: false }>();
  return paginated(await page<Result>('results.list', rows, pagination, RESULT_ERRORS));
});

/** ADMINS, OR THE PAPER'S SUBJECT TEACHER. ENTERS ONE STUDENT'S MARK. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const mark = await parseJsonBody(request, createResultSchema);
  const paper = unwrapResult(await findPaperForWrite(supabase, mark.examSubjectId, actor));
  unwrapResult(await validateMarks(supabase, paper, [mark], false));

  const query = supabase.from('results').insert([{ ...mark, classId: paper.classId, enteredByUserId: actor.id }]).select(RESULT_COLUMNS);
  const [saved] = await many<Result>('results.insert', query, RESULT_ERRORS);
  return created(saved);
});
