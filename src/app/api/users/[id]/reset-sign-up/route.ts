import { requireAdmin } from '@/functions/authorization';
import { resetTeacherSignUp } from '@/functions/sign-in';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * ADMIN ONLY. LETS A TEACHER (`{id}` IS `users.id`) SIGN UP AGAIN, E.G. AFTER A
 * FORGOTTEN PASSWORD: ENDS THEIR SESSIONS AND INVALIDATES THE OLD PASSWORD.
 */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/users/[id]/reset-sign-up'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await resetTeacherSignUp(id, { actor })));
});
