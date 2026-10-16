import { z } from 'zod';
import { EXAM_SUBJECT_COLUMNS, EXAM_SUBJECT_ERRORS, MAX_MARKS_SCHEMA, PASS_MARKS_SCHEMA } from '@/constants/exam-subjects';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findExamSubject, validateExamDate } from '@/functions/exam-subjects';
import { findExam } from '@/functions/exams';
import { conflict, validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { maybeOne, one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { ExamSubject } from '@/types/exam-subjects';
import type { DbClient } from '@/types/supabase';

type Context = RouteContext<'/api/exam-subjects/[id]'>;

/** EXAM, CLASS AND SUBJECT ARE DELIBERATELY ABSENT: A PAPER WITH RESULTS IS NEVER RELABELLED. */
const updateExamSubjectSchema = z.strictObject({
  maxMarks: MAX_MARKS_SCHEMA.optional(),
  passMarks: PASS_MARKS_SCHEMA,
  examDate: z.iso.date().nullable().optional(),
});

/** THE HIGHEST MARK ALREADY ENTERED FOR A PAPER, OR NULL IF NONE. */
async function highestMark(supabase: DbClient, examSubjectId: string): Promise<number | null> {
  const query = supabase
    .from('results')
    .select('marksObtained')
    .eq('examSubjectId', examSubjectId)
    .order('marksObtained', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = await maybeOne<{ marksObtained: number }>('results.highest', query, EXAM_SUBJECT_ERRORS);
  return row?.marksObtained ?? null;
}

/** RLS-SCOPED; OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findExamSubject(supabase, id)));
});

/**
 * ADMIN ONLY. maxMarks, passMarks, examDate — VALIDATED AGAINST THE RESULTING
 * PAPER. maxMarks MAY ONLY DROP WHILE NO ENTERED MARK EXCEEDS IT (409).
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateExamSubjectSchema));
  const current = unwrapResult(await findExamSubject(supabase, id));

  const maxMarks = changes.maxMarks ?? current.maxMarks;
  const passMarks = 'passMarks' in changes ? changes.passMarks : current.passMarks;
  if (passMarks != null && passMarks > maxMarks) {
    throw validationError([{ path: 'passMarks', message: 'passMarks must be between 0 and maxMarks.' }]);
  }
  if (changes.maxMarks !== undefined && changes.maxMarks < current.maxMarks) {
    const highest = await highestMark(supabase, id);
    if (highest !== null && highest > changes.maxMarks) {
      throw conflict(`Marks up to ${highest} have already been entered; maxMarks cannot be lower than that.`);
    }
  }
  if ('examDate' in changes) {
    const exam = unwrapResult(await findExam(supabase, current.examId));
    unwrapResult(await validateExamDate(supabase, exam, changes.examDate));
  }

  const query = supabase.from('examSubjects').update(changes).eq('id', id).select(EXAM_SUBJECT_COLUMNS).maybeSingle();
  return ok(await one<ExamSubject>('examSubjects.update', query, EXAM_SUBJECT_ERRORS));
});
