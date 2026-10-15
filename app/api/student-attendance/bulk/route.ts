import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { requireRole } from "@/lib/auth/authorization";
import { bulkStudentAttendanceSchema, recordClassAttendance } from "@/lib/student-attendance/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admins, or teachers of the class. Records a whole class for one day:
 * { classId, attendanceDate, records: [{ studentId, status, remarks? }] } (max 200).
 * All-or-nothing: any invalid or duplicate record rejects the whole submission.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const input = await parseJsonBody(request, bulkStudentAttendanceSchema);
  return created(await recordClassAttendance(supabase, input, actor));
});
