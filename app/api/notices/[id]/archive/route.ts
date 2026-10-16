import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams } from "@/lib/api/validation";
import { requireAdmin } from "@/lib/auth/authorization";
import { archiveNotice } from "@/lib/notices/service";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/notices/[id]/archive">;

/** Admin only. draft or published → archived (409 if already archived). Archived notices are hidden from teachers and students. */
export const POST = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await archiveNotice(supabase, id));
});
