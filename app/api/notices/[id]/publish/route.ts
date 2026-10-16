import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams } from "@/lib/api/validation";
import { requireAdmin } from "@/lib/auth/authorization";
import { publishNotice } from "@/lib/notices/service";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/notices/[id]/publish">;

/** Admin only. draft → published (needs at least one audience; 409 otherwise). publishedAt is set by the database. */
export const POST = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await publishNotice(supabase, id));
});
