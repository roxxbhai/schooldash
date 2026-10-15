import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams } from "@/lib/api/validation";
import { makeCurrentAcademicYear } from "@/lib/academic-years/service";
import { requireAdmin } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admin only. Atomically makes this the only current academic year. Idempotent. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/academic-years/[id]/set-current">) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await makeCurrentAcademicYear(supabase, id));
});
