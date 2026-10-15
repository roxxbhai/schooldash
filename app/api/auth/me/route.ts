import { ok, apiRoute } from "@/lib/api/response";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { toSessionProfile } from "@/lib/auth/session";

/** The signed-in user's session profile: id, role, and active status only. */
export const GET = apiRoute(async () => {
  const user = await requireAuthenticatedUser();
  return ok(toSessionProfile(user));
});
