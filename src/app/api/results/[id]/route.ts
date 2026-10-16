import { z } from 'zod';
import { RESULT_COLUMNS, RESULT_ERRORS } from '@/constants/results';
import { requireAuthenticatedUser, requireRole } from '@/functions/authorization';
import { findExamSubject } from '@/functions/exam-subjects';
import { requirePaperWriter } from '@/functions/results';
import { conflict, notFound, validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { maybeOne, one, orNullIfMissing } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { marksSchema, optionalText } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Result } from '@/types/results';
import type { DbClient } from '@/types/supabase';

type Context = RouteContext<'/api/results/[id]'>;

/** ONLY THE MARK AND REMARKS CAN CHANGE, AND ONLY FROM THE VERSION THE CLIENT LAST READ. */
const correctResultSchema = z
  .strictObject({
    marksObtained: marksSchema.optional(),
    remarks: optionalText(500),
    /** THE `updatedAt` THE CLIENT LAST READ (OPTIMISTIC CONCURRENCY). */
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .refine((correction) => correction.marksObtained !== undefined || correction.remarks !== undefined, {
    path: [''],
    message: 'Provide marksObtained and/or remarks.',
  });

function findResult(supabase: DbClient, id: string) {
  return one<Result>('results.get', supabase.from('results').select(RESULT_COLUMNS).eq('id', id).maybeSingle(), RESULT_ERRORS);
}

/** RLS-SCOPED; OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await findResult(supabase, id));
});

/**
 * ADMINS, OR THE PAPER'S SUBJECT TEACHER. CORRECTS marksObtained/remarks AND
 * RECORDS THE EDITOR (AUDITED WITH OLD AND NEW MARKS). THE UPDATE APPLIES ONLY
 * IF THE ROW STILL HAS `expectedUpdatedAt`: A STALE WRITE IS A 409, NEVER A
 * SILENT OVERWRITE, SO TWO SIMULTANEOUS CORRECTIONS CANNOT BOTH WIN.
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { expectedUpdatedAt, ...changes } = await parseJsonBody(request, correctResultSchema);

  const existing = await findResult(supabase, id); // 404 IF MISSING OR NOT VISIBLE
  const paper = unwrapResult(await findExamSubject(supabase, existing.examSubjectId));
  unwrapResult(await requirePaperWriter(supabase, actor, paper));
  if (changes.marksObtained !== undefined && changes.marksObtained > paper.maxMarks) {
    throw validationError([{ path: 'marksObtained', message: `marksObtained must not exceed maxMarks (${paper.maxMarks}).` }]);
  }

  const query = supabase
    .from('results')
    .update({ ...changes, enteredByUserId: actor.id })
    .eq('id', id)
    .eq('updatedAt', expectedUpdatedAt)
    .select(RESULT_COLUMNS)
    .maybeSingle();
  const corrected = await maybeOne<Result>('results.update', query, RESULT_ERRORS);
  if (corrected) return ok(corrected);

  // NOTHING MATCHED: EITHER THE ROW CHANGED SINCE THE CLIENT READ IT, OR IT VANISHED.
  if (!(await orNullIfMissing(findResult(supabase, id)))) throw notFound('Result not found.');
  throw conflict('These marks were changed by someone else since you loaded them. Reload and try again.');
});
