import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { maybeOne, one, page, rpcResult } from "@/lib/db/query";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";

/** Supabase queries for teachers. Runs as the caller; RLS applies. */

type Client = SupabaseClient<Database>;

export type Teacher = Pick<
  Tables<"teachers">,
  "id" | "userId" | "employeeCode" | "qualification" | "dateOfJoining" | "createdAt" | "updatedAt"
> & { user: Pick<Tables<"users">, "fullName" | "email" | "phone" | "isActive"> };

const BASE = "id, userId, employeeCode, qualification, dateOfJoining, createdAt, updatedAt";
const COLUMNS = `${BASE}, user:users!teachersUserFkey(fullName, email, phone, isActive)`;
const COLUMNS_FILTERABLE = `${BASE}, user:users!teachersUserFkey!inner(fullName, email, phone, isActive)`;

export const teacherErrors: DbErrorContext = {
  notFoundMessage: "Teacher not found.",
  constraints: {
    teachers_employeeCode_key: { message: "A teacher with this employee code already exists.", field: "employeeCode" },
    teachersEmployeeCodeNotBlank: { message: "employeeCode is required.", field: "employeeCode" },
    usersFullNameNotBlank: { message: "fullName is required.", field: "fullName" },
  },
};

export interface TeacherFilters {
  isActive?: boolean;
}

export function listTeachers(client: Client, pagination: Pagination, filters: TeacherFilters) {
  let query = client
    .from("teachers")
    .select(filters.isActive === undefined ? COLUMNS : COLUMNS_FILTERABLE, { count: "exact" });
  if (filters.isActive !== undefined) query = query.eq("user.isActive", filters.isActive);
  return page<Teacher>(
    "teachers.list",
    query.order("employeeCode").range(pagination.from, pagination.to) as never,
    teacherErrors,
  );
}

export function findTeacher(client: Client, id: string) {
  return one<Teacher>("teachers.get", client.from("teachers").select(COLUMNS).eq("id", id).maybeSingle() as never, teacherErrors);
}

export function findTeacherByUserId(client: Client, userId: string) {
  return one<Teacher>(
    "teachers.getByUser",
    client.from("teachers").select(COLUMNS).eq("userId", userId).maybeSingle() as never,
    teacherErrors,
  );
}

/** A teacher's id and account status, or null if no such teacher is visible. */
export function findTeacherStatus(client: Client, teacherId: string) {
  return maybeOne<{ id: string; user: { isActive: boolean } | null }>(
    "teachers.status",
    client.from("teachers").select("id, user:users!teachersUserFkey(isActive)").eq("id", teacherId).maybeSingle() as never,
    teacherErrors,
  );
}

export async function updateTeacherProfile(client: Client, id: string, userPatch: Json, profilePatch: Json) {
  await rpcResult(
    "teachers.update",
    client.rpc("updateTeacherProfile", { teacherId: id, userPatch, profilePatch }),
    teacherErrors,
  );
}
