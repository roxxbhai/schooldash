import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { getSubject, updateSubject, updateSubjectSchema } from "@/lib/subjects/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/subjects/[id]">;

/** Any active user. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getSubject(supabase, id));
});

/** Admin only. code, name, description. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateSubjectSchema);
  return ok(await updateSubject(supabase, id, input));
});
