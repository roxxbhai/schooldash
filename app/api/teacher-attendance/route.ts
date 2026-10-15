import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireRole } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createTeacherAttendanceSchema,
  listTeacherAttendance,
  listTeacherAttendanceQuerySchema,
  recordTeacherAttendance,
} from "@/lib/teacher-attendance/service";

/** Admins: all. Teachers: their own (another teacherId → 403). Students: 403. ?teacherId= ?status= ?date= | ?from=&to= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listTeacherAttendanceQuerySchema);
  const { items, pagination } = await listTeacherAttendance(supabase, getPagination(searchParams), filters, viewer);
  return paginated(items, pagination);
});

/** Admin only. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createTeacherAttendanceSchema);
  return created(await recordTeacherAttendance(supabase, input, actor));
});
