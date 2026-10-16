import { NOTICE_ERRORS } from '@/constants/notices';
import { requireAdmin } from '@/functions/authorization';
import { findNotice } from '@/functions/notices';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * ADMIN ONLY. DRAFT → PUBLISHED (409 WITHOUT AN AUDIENCE OR FROM ANY OTHER STATE).
 * publishedAt IS STAMPED BY THE DATABASE CLOCK (`publishNotice`).
 */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/notices/[id]/publish'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  await rpcResult('notices.publish', supabase.rpc('publishNotice', { noticeId: id }), NOTICE_ERRORS);
  return ok(unwrapResult(await findNotice(supabase, id, true)));
});
