import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAuthenticatedUser, requireRole } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import {
  correctStudentAttendance,
  getStudentAttendance,
  updateStudentAttendanceSchema,
} from "@/lib/student-attendance/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/student-attendance/[id]">;

/** Visible per RLS (admin / teacher of the class / the student); otherwise 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getStudentAttendance(supabase, id));
});

/** Admins, or teachers of the class. Corrects status/remarks only. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateStudentAttendanceSchema);
  return ok(await correctStudentAttendance(supabase, id, input, actor));
});
