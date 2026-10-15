import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { getEnrollment, updateEnrollment, updateEnrollmentSchema } from "@/lib/enrollments/service";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/enrollments/[id]">;

/** Visible per RLS (admin / teacher of the class / the student); otherwise 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getEnrollment(supabase, id));
});

/** Admin only. rollNumber; classId (same academic year only). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateEnrollmentSchema);
  return ok(await updateEnrollment(supabase, id, input));
});
