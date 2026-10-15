import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireRole } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  correctTeacherAttendance,
  getTeacherAttendance,
  updateTeacherAttendanceSchema,
} from "@/lib/teacher-attendance/service";

type Context = RouteContext<"/api/teacher-attendance/[id]">;

/** Admins: any. Teachers: their own (others → 404 via RLS). Students: 403. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getTeacherAttendance(supabase, id));
});

/** Admin only. Corrects status/remarks only. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateTeacherAttendanceSchema);
  return ok(await correctTeacherAttendance(supabase, id, input, actor));
});
