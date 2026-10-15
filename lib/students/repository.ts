import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page, rpcResult } from "@/lib/db/query";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";

/**
 * Supabase queries for students. Runs as the caller, so RLS scopes reads:
 * admins see all students, teachers the students they teach, a student
 * themselves.
 */

type Client = SupabaseClient<Database>;

export type Student = Omit<Tables<"students">, "role"> & {
  user: Pick<Tables<"users">, "fullName" | "email" | "phone" | "isActive">;
};

const BASE =
  "id, userId, admissionNumber, admissionDate, dateOfBirth, gender, bloodGroup, fatherName, motherName, address, createdAt, updatedAt";
const userEmbed = (inner: boolean) =>
  `user:users!studentsUserFkey${inner ? "!inner" : ""}(fullName, email, phone, isActive)`;

export const studentErrors: DbErrorContext = {
  notFoundMessage: "Student not found.",
  constraints: {
    students_admissionNumber_key: {
      message: "A student with this admission number already exists.",
      field: "admissionNumber",
    },
    studentsAdmissionNumberNotBlank: { message: "admissionNumber is required.", field: "admissionNumber" },
    usersFullNameNotBlank: { message: "fullName is required.", field: "fullName" },
  },
};

export interface StudentFilters {
  isActive?: boolean;
  classId?: string;
}

export function listStudents(client: Client, pagination: Pagination, filters: StudentFilters) {
  const columns = [
    BASE,
    userEmbed(filters.isActive !== undefined),
    // Empty embed: filters by enrollment without adding fields to the response.
    ...(filters.classId ? ["enrollment:studentEnrollments!inner()"] : []),
  ].join(", ");
  let query = client.from("students").select(columns, { count: "exact" });
  if (filters.isActive !== undefined) query = query.eq("user.isActive", filters.isActive);
  if (filters.classId) query = query.eq("enrollment.classId", filters.classId);
  return page<Student>(
    "students.list",
    query.order("admissionNumber").range(pagination.from, pagination.to) as never,
    studentErrors,
  );
}

export function findStudent(client: Client, id: string) {
  return one<Student>(
    "students.get",
    client.from("students").select(`${BASE}, ${userEmbed(false)}`).eq("id", id).maybeSingle() as never,
    studentErrors,
  );
}

export function findStudentByUserId(client: Client, userId: string) {
  return one<Student>(
    "students.getByUser",
    client.from("students").select(`${BASE}, ${userEmbed(false)}`).eq("userId", userId).maybeSingle() as never,
    studentErrors,
  );
}

/** A student's id and account status, or null if not visible. */
export function findStudentStatus(client: Client, studentId: string) {
  return maybeOne<{ id: string; user: { isActive: boolean } | null }>(
    "students.status",
    client.from("students").select("id, user:users!studentsUserFkey(isActive)").eq("id", studentId).maybeSingle() as never,
    studentErrors,
  );
}

export async function updateStudentProfile(client: Client, id: string, userPatch: Json, profilePatch: Json) {
  await rpcResult(
    "students.update",
    client.rpc("updateStudentProfile", { studentId: id, userPatch, profilePatch }),
    studentErrors,
  );
}

/** Account status of each visible student among `studentIds`. */
export async function studentActiveStates(client: Client, studentIds: string[]): Promise<Map<string, boolean>> {
  const rows = await many<{ id: string; user: { isActive: boolean } | null }>(
    "students.activeStates",
    client.from("students").select("id, user:users!studentsUserFkey(isActive)").in("id", studentIds) as never,
    studentErrors,
  );
  return new Map(rows.map((row) => [row.id, row.user?.isActive === true]));
}
