import { z } from 'zod';
import { NOTICE_BODY_SCHEMA, NOTICE_COLUMNS, NOTICE_ERRORS, NOTICE_TITLE_SCHEMA } from '@/constants/notices';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { explainRefusedChange, findNotice } from '@/functions/notices';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { maybeOne } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Notice } from '@/types/notices';

type Context = RouteContext<'/api/notices/[id]'>;

const updateNoticeSchema = z.strictObject({
  title: NOTICE_TITLE_SCHEMA.optional(),
  body: NOTICE_BODY_SCHEMA.optional(),
  category: optionalText(50),
});

/** VISIBLE PER RLS (ADMINS: ANY; OTHERS: PUBLISHED AND ADDRESSED TO THEM); OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findNotice(supabase, id, viewer.role === 'ADMIN')));
});

/** ADMIN ONLY; DRAFTS ONLY (409 OTHERWISE). TITLE, BODY, CATEGORY. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateNoticeSchema));

  const query = supabase.from('notices').update(changes).eq('id', id).in('status', ['draft']).select(NOTICE_COLUMNS).maybeSingle();
  const edited = await maybeOne<Notice>('notices.update', query, NOTICE_ERRORS);
  if (!edited) unwrapResult(await explainRefusedChange(supabase, id, 'Only draft notices can be edited.'));
  return ok(unwrapResult(await findNotice(supabase, id, true)));
});
