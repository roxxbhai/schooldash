import { signOutCurrentSession } from '@/functions/session';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/** SIGNS OUT THE CURRENT SESSION AND CLEARS ITS COOKIES. SUCCEEDS WITHOUT A SESSION. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);

  const supabase = await createSupabaseServerClient();
  unwrapResult(await signOutCurrentSession(supabase));
  return ok({ signedOut: true });
});
