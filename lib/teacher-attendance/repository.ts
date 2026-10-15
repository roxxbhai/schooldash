import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";

/**
 * Supabase queries for teacher attendance. Runs as the caller, so RLS scopes
 * every read and write: admins see and write all; a teacher reads only their
 * own records; students see nothing.
 */

type Client = SupabaseClient<Database>;
export type TeacherAttendance = Tables<"teacherAttendance">;
type AttendanceStatus = Database["public"]["Enums"]["attendanceStatus"];

const COLUMNS = "id, teacherId, attendanceDate, status, remarks, markedByUserId, createdAt, updatedAt";

export const teacherAttendanceErrors: DbErrorContext = {
  notFoundMessage: "Attendance record not found.",
  constraints: {
    teacherAttendanceTeacherDateKey: { message: "Attendance for this teacher on this date already exists." },
    teacherAttendance_teacherId_fkey: { message: "Teacher not found.", field: "teacherId" },
    attendanceDateNotFuture: { message: "Attendance cannot be recorded for a future date.", field: "attendanceDate" },
    attendanceTeacherActive: { message: "The teacher's account is deactivated.", field: "teacherId" },
  },
};

export interface TeacherAttendanceFilters {
  teacherId?: string;
  status?: AttendanceStatus;
  date?: string;
  from?: string;
  to?: string;
}

export function listTeacherAttendance(client: Client, pagination: Pagination, filters: TeacherAttendanceFilters) {
  let query = client.from("teacherAttendance").select(COLUMNS, { count: "exact" });
  if (filters.teacherId) query = query.eq("teacherId", filters.teacherId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date) query = query.eq("attendanceDate", filters.date);
  if (filters.from) query = query.gte("attendanceDate", filters.from);
  if (filters.to) query = query.lte("attendanceDate", filters.to);
  return page<TeacherAttendance>(
    "teacherAttendance.list",
    query
      .order("attendanceDate", { ascending: false })
      .order("teacherId")
      .order("id")
      .range(pagination.from, pagination.to),
    teacherAttendanceErrors,
  );
}

export function findTeacherAttendance(client: Client, id: string) {
  return one<TeacherAttendance>(
    "teacherAttendance.get",
    client.from("teacherAttendance").select(COLUMNS).eq("id", id).maybeSingle(),
    teacherAttendanceErrors,
  );
}

export async function insertTeacherAttendance(client: Client, row: TablesInsert<"teacherAttendance">) {
  const [created] = await many<TeacherAttendance>(
    "teacherAttendance.insert",
    client.from("teacherAttendance").insert(row).select(COLUMNS),
    teacherAttendanceErrors,
  );
  return created;
}

export function updateTeacherAttendance(
  client: Client,
  id: string,
  values: { status?: AttendanceStatus; remarks?: string | null; markedByUserId: string },
) {
  return one<TeacherAttendance>(
    "teacherAttendance.update",
    client.from("teacherAttendance").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    teacherAttendanceErrors,
  );
}
