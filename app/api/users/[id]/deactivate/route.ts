import { z } from "zod";
import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams, uuidSchema } from "@/lib/api/validation";
import { setAccountStatus } from "@/lib/auth/account-status";
import { requireAdmin } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admin only. Deactivates an account and revokes its sessions; history is kept. Idempotent. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/users/[id]/deactivate">) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, z.object({ id: uuidSchema }));
  return ok(await setAccountStatus(id, false, { actor }));
});
