import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin } from "@/lib/auth/authorization";
import { setAudiences, setAudiencesSchema } from "@/lib/notices/service";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/notices/[id]/audiences">;

/** Admin only; drafts only (409 otherwise). Replaces the whole audience set atomically. { audiences: [...] } */
export const PUT = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, setAudiencesSchema);
  return ok(await setAudiences(supabase, id, input));
});
