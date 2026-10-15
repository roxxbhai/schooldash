import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Supabase queries for student enrollments. Runs as the caller, so RLS
 * scopes reads: admins see all, teachers enrollments in classes they teach,
 * a student their own.
 */

type Client = SupabaseClient<Database>;
export type Enrollment = Tables<"studentEnrollments">;

const COLUMNS = "id, studentId, classId, academicYearId, rollNumber, enrolledOn, createdAt, updatedAt";

export const enrollmentErrors: DbErrorContext = {
  notFoundMessage: "Enrollment not found.",
  constraints: {
    studentEnrollmentsStudentYearKey: {
      message: "This student is already enrolled in a class for that academic year.",
      field: "studentId",
    },
    studentEnrollmentsStudentClassKey: {
      message: "This student is already enrolled in that class.",
      field: "classId",
    },
    studentEnrollmentsClassRollKey: { message: "This roll number is already used in the class.", field: "rollNumber" },
    studentEnrollmentsRollNumberPositive: { message: "rollNumber must be a positive integer.", field: "rollNumber" },
    studentEnrollmentsClassFkey: {
      // Insert/update: the class doesn't exist in that year. Changing the class of an
      // enrollment that already has attendance/results is reported as 409 (still referenced).
      message: "The class does not exist in the enrollment's academic year.",
      field: "classId",
    },
    studentEnrollments_studentId_fkey: { message: "Student not found.", field: "studentId" },
    studentAttendanceEnrollmentFkey: {
      message: "This enrollment has attendance records; the student cannot be moved to another class.",
    },
    resultsEnrollmentFkey: {
      message: "This enrollment has results; the student cannot be moved to another class.",
    },
  },
};

export interface EnrollmentFilters {
  studentId?: string;
  classId?: string;
  academicYearId?: string;
}

export function listEnrollments(client: Client, pagination: Pagination, filters: EnrollmentFilters) {
  let query = client.from("studentEnrollments").select(COLUMNS, { count: "exact" });
  if (filters.studentId) query = query.eq("studentId", filters.studentId);
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.academicYearId) query = query.eq("academicYearId", filters.academicYearId);
  return page<Enrollment>(
    "enrollments.list",
    query.order("enrolledOn", { ascending: false }).order("rollNumber").order("id").range(pagination.from, pagination.to),
    enrollmentErrors,
  );
}

export function findEnrollment(client: Client, id: string) {
  return one<Enrollment>(
    "enrollments.get",
    client.from("studentEnrollments").select(COLUMNS).eq("id", id).maybeSingle(),
    enrollmentErrors,
  );
}

export function insertEnrollment(client: Client, values: TablesInsert<"studentEnrollments">) {
  return one<Enrollment>(
    "enrollments.insert",
    client.from("studentEnrollments").insert(values).select(COLUMNS).maybeSingle(),
    enrollmentErrors,
  );
}

export function updateEnrollment(client: Client, id: string, values: TablesUpdate<"studentEnrollments">) {
  return one<Enrollment>(
    "enrollments.update",
    client.from("studentEnrollments").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    enrollmentErrors,
  );
}

/** Students (among `studentIds`) enrolled in `classId`. */
export async function enrolledStudentIds(client: Client, classId: string, studentIds: string[]): Promise<Set<string>> {
  const rows = await many<{ studentId: string }>(
    "studentEnrollments.inClass",
    client.from("studentEnrollments").select("studentId").eq("classId", classId).in("studentId", studentIds),
    enrollmentErrors,
  );
  return new Set(rows.map((row) => row.studentId));
}

/** A student's enrollment in a given academic year, or null. */
export function findEnrollmentForYear(client: Client, studentId: string, academicYearId: string) {
  return maybeOne<Enrollment>(
    "enrollments.forYear",
    client.from("studentEnrollments").select(COLUMNS).eq("studentId", studentId).eq("academicYearId", academicYearId).maybeSingle(),
    enrollmentErrors,
  );
}
