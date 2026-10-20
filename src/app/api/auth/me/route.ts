import { requireAuthenticatedUser } from '@/functions/authorization';
import { toSessionProfile } from '@/functions/session';
import { apiRoute, ok } from '@/helpers/api-response';
import { unwrapResult } from '@/helpers/function-result';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/** THE SIGNED-IN USER'S SESSION PROFILE: ID, ROLE, ACTIVE STATUS, NAME AND EMAIL. */
export const GET = apiRoute(async () => {
  const supabase = await createSupabaseServerClient();
  const user = unwrapResult(await requireAuthenticatedUser(supabase));
  return ok(toSessionProfile(user));
});
