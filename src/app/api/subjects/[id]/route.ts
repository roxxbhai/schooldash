import { z } from 'zod';
import { SUBJECT_COLUMNS, SUBJECT_ERRORS, SUBJECT_NAME_SCHEMA } from '@/constants/subjects';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findSubject } from '@/functions/subjects';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Subject } from '@/types/subjects';

type Context = RouteContext<'/api/subjects/[id]'>;

/** code IS DELIBERATELY ABSENT: SUBJECT CODES ARE GENERATED AND PERMANENT. */
const updateSubjectSchema = z.strictObject({
  name: SUBJECT_NAME_SCHEMA.optional(),
  description: optionalText(500),
});

/** ANY ACTIVE USER. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findSubject(supabase, id)));
});

/** ADMIN ONLY. NAME, DESCRIPTION. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateSubjectSchema));
  const query = supabase.from('subjects').update(changes).eq('id', id).select(SUBJECT_COLUMNS).maybeSingle();
  return ok(await one<Subject>('subjects.update', query, SUBJECT_ERRORS));
});
