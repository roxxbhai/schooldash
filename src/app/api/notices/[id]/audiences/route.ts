import { z } from 'zod';
import { AUDIENCES_SCHEMA, NOTICE_ERRORS } from '@/constants/notices';
import { requireAdmin } from '@/functions/authorization';
import { findNotice, toAudienceRows } from '@/functions/notices';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

const setAudiencesSchema = z.strictObject({ audiences: AUDIENCES_SCHEMA });

/**
 * ADMIN ONLY; DRAFTS ONLY (409 OTHERWISE). REPLACES THE WHOLE AUDIENCE SET IN ONE
 * DATABASE TRANSACTION (`setNoticeAudiences`), WHICH LOCKS THE NOTICE SO A
 * CONCURRENT PUBLISH CANNOT LEAVE A PUBLISHED NOTICE WITHOUT AUDIENCES.
 */
export const PUT = apiRoute(async (request: Request, context: RouteContext<'/api/notices/[id]/audiences'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { audiences } = await parseJsonBody(request, setAudiencesSchema);
  const audienceRows = unwrapResult(await toAudienceRows(supabase, audiences));
  await rpcResult('notices.setAudiences', supabase.rpc('setNoticeAudiences', { noticeId: id, audiences: audienceRows }), NOTICE_ERRORS);
  return ok(unwrapResult(await findNotice(supabase, id, true)));
});
