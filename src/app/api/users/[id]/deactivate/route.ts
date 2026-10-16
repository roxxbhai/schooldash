import { setAccountStatus } from '@/functions/account-status';
import { requireAdmin } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/** ADMIN ONLY. DEACTIVATES AN ACCOUNT AND REVOKES ITS SESSIONS; HISTORY IS KEPT. IDEMPOTENT. */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/users/[id]/deactivate'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await setAccountStatus(id, false, { actor })));
});
