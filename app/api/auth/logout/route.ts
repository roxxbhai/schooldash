import { assertSameOrigin } from "@/lib/api/csrf";
import { ok, apiRoute } from "@/lib/api/response";
import { signOutCurrentSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Signs out the current session and clears its cookies. Succeeds without a session. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);

  const supabase = await createSupabaseServerClient();
  await signOutCurrentSession(supabase);
  return ok({ signedOut: true });
});
