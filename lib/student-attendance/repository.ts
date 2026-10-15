import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";

/**
 * Supabase queries for student attendance. Runs as the caller, so RLS scopes
 * every read and write: admins see all, teachers the classes they teach, a
 * student their own records. Database triggers re-check dates and account
 * status on insert (migration 8).
 */

type Client = SupabaseClient<Database>;
export type StudentAttendance = Tables<"studentAttendance">;
export type AttendanceStatus = Database["public"]["Enums"]["attendanceStatus"];

const COLUMNS = "id, studentId, classId, attendanceDate, status, remarks, markedByUserId, createdAt, updatedAt";

export const studentAttendanceErrors: DbErrorContext = {
  notFoundMessage: "Attendance record not found.",
  constraints: {
    studentAttendanceStudentDateKey: { message: "Attendance for this student on this date already exists." },
    studentAttendanceEnrollmentFkey: { message: "The student is not enrolled in this class.", field: "studentId" },
    attendanceDateNotFuture: { message: "Attendance cannot be recorded for a future date.", field: "attendanceDate" },
    attendanceDateInAcademicYear: {
      message: "The date is outside the class's academic year.",
      field: "attendanceDate",
    },
    attendanceStudentActive: { message: "The student's account is deactivated.", field: "studentId" },
  },
};

export interface StudentAttendanceFilters {
  classId?: string;
  studentId?: string;
  status?: AttendanceStatus;
  date?: string;
  from?: string;
  to?: string;
}

export function listStudentAttendance(client: Client, pagination: Pagination, filters: StudentAttendanceFilters) {
  let query = client.from("studentAttendance").select(COLUMNS, { count: "exact" });
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.studentId) query = query.eq("studentId", filters.studentId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date) query = query.eq("attendanceDate", filters.date);
  if (filters.from) query = query.gte("attendanceDate", filters.from);
  if (filters.to) query = query.lte("attendanceDate", filters.to);
  return page<StudentAttendance>(
    "studentAttendance.list",
    query
      .order("attendanceDate", { ascending: false })
      .order("studentId")
      .order("id")
      .range(pagination.from, pagination.to),
    studentAttendanceErrors,
  );
}

export function findStudentAttendance(client: Client, id: string) {
  return one<StudentAttendance>(
    "studentAttendance.get",
    client.from("studentAttendance").select(COLUMNS).eq("id", id).maybeSingle(),
    studentAttendanceErrors,
  );
}

/** Inserts all rows in ONE statement: either every record is saved or none is. */
export function insertStudentAttendance(client: Client, rows: TablesInsert<"studentAttendance">[]) {
  return many<StudentAttendance>(
    "studentAttendance.insert",
    client.from("studentAttendance").insert(rows).select(COLUMNS),
    studentAttendanceErrors,
  );
}

export function updateStudentAttendance(
  client: Client,
  id: string,
  values: { status?: AttendanceStatus; remarks?: string | null; markedByUserId: string },
) {
  return one<StudentAttendance>(
    "studentAttendance.update",
    client.from("studentAttendance").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    studentAttendanceErrors,
  );
}

/** The class with its academic-year dates, or null if not visible. */
export function findClassWithYear(client: Client, classId: string) {
  return maybeOne<{ id: string; academicYear: { startDate: string; endDate: string } | null }>(
    "classes.withYear",
    client
      .from("classes")
      .select("id, academicYear:academicYears!classes_academicYearId_fkey(startDate, endDate)")
      .eq("id", classId)
      .maybeSingle() as never,
    studentAttendanceErrors,
  );
}
