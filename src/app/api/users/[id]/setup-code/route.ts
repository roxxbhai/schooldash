import { issueSetupCode } from '@/functions/account-setup';
import { requireAdmin } from '@/functions/authorization';
import { apiRoute, created } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * ADMIN ONLY. ISSUES A NEW ONE-TIME SETUP CODE FOR AN ACTIVE TEACHER OR STUDENT
 * (`{id}` IS `users.id`), REPLACING ANY EARLIER CODE. ALSO SERVES AS A PASSWORD RESET.
 */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/users/[id]/setup-code'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return created(unwrapResult(await issueSetupCode(id, { actor })));
});
