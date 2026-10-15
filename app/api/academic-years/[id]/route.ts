import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { getAcademicYear, updateAcademicYear, updateAcademicYearSchema } from "@/lib/academic-years/service";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/academic-years/[id]">;

/** Any active user. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getAcademicYear(supabase, id));
});

/** Admin only. name, startDate, endDate. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateAcademicYearSchema);
  return ok(await updateAcademicYear(supabase, id, input));
});
