import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAuthenticatedUser, requireRole } from "@/lib/auth/authorization";
import {
  createStudentAttendanceSchema,
  listStudentAttendance,
  listStudentAttendanceQuerySchema,
  recordStudentAttendance,
} from "@/lib/student-attendance/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admins: all. Teachers: classes they teach. Students: their own (another studentId → 403).
 * ?classId= ?studentId= ?status= ?date= | ?from=&to=
 */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listStudentAttendanceQuerySchema);
  const { items, pagination } = await listStudentAttendance(supabase, getPagination(searchParams), filters, viewer);
  return paginated(items, pagination);
});

/** Admins, or teachers of the class. Records one student's attendance for one day. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const input = await parseJsonBody(request, createStudentAttendanceSchema);
  return created(await recordStudentAttendance(supabase, input, actor));
});
