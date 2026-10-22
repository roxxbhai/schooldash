import { ADMIN_SIGN_IN_SCHEMA } from '@/constants/sign-in';
import { toSessionProfile } from '@/functions/session';
import { signInAdmin } from '@/functions/sign-in';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * ADMINISTRATOR SIGN-IN: EMAIL + PASSWORD. SETS THE SESSION COOKIES ON SUCCESS.
 * ONLY ADMIN ACCOUNTS; ANY OTHER ACCOUNT GETS THE SAME 401 AS WRONG CREDENTIALS.
 * THERE IS NO ADMIN SIGN-UP.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, ADMIN_SIGN_IN_SCHEMA);
  const supabase = await createSupabaseServerClient();
  return ok(toSessionProfile(unwrapResult(await signInAdmin(supabase, credentials))));
});
