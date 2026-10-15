import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAuthenticatedUser, requireRole } from "@/lib/auth/authorization";
import { correctResult, getResult, updateResultSchema } from "@/lib/results/service";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/results/[id]">;

/** Visible per RLS (admin / teacher of the paper / the student); otherwise 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getResult(supabase, id));
});

/**
 * Admins, or teachers of the paper's class + subject. { marksObtained?, remarks?, expectedUpdatedAt }.
 * 409 if the result changed since `expectedUpdatedAt` (no silent overwrite).
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateResultSchema);
  return ok(await correctResult(supabase, id, input, actor));
});
