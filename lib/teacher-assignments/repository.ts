import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";

/**
 * Supabase queries for teacher assignments. Runs as the caller, so RLS scopes
 * reads: admins see all, a teacher their own assignments, a student the
 * assignments of their class.
 */

type Client = SupabaseClient<Database>;
export type TeacherAssignment = Tables<"teacherAssignments">;

const COLUMNS = "id, teacherId, classId, subjectId, createdAt, updatedAt";

export const assignmentErrors: DbErrorContext = {
  notFoundMessage: "Teacher assignment not found.",
  constraints: {
    teacherAssignmentsKey: { message: "This teacher is already assigned to that class and subject." },
    teacherAssignments_teacherId_fkey: { message: "Teacher not found.", field: "teacherId" },
    teacherAssignments_classId_fkey: { message: "Class not found.", field: "classId" },
    teacherAssignments_subjectId_fkey: { message: "Subject not found.", field: "subjectId" },
    timetableEntriesAssignmentFkey: {
      message: "This assignment is used by timetable entries and cannot be removed.",
    },
  },
};

export interface AssignmentFilters {
  teacherId?: string;
  classId?: string;
  subjectId?: string;
}

export function listAssignments(client: Client, pagination: Pagination, filters: AssignmentFilters) {
  let query = client.from("teacherAssignments").select(COLUMNS, { count: "exact" });
  if (filters.teacherId) query = query.eq("teacherId", filters.teacherId);
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.subjectId) query = query.eq("subjectId", filters.subjectId);
  return page<TeacherAssignment>(
    "teacherAssignments.list",
    query.order("createdAt", { ascending: false }).order("id").range(pagination.from, pagination.to),
    assignmentErrors,
  );
}

export function findAssignment(client: Client, id: string) {
  return one<TeacherAssignment>(
    "teacherAssignments.get",
    client.from("teacherAssignments").select(COLUMNS).eq("id", id).maybeSingle(),
    assignmentErrors,
  );
}

export function insertAssignment(client: Client, values: TablesInsert<"teacherAssignments">) {
  return one<TeacherAssignment>(
    "teacherAssignments.insert",
    client.from("teacherAssignments").insert(values).select(COLUMNS).maybeSingle(),
    assignmentErrors,
  );
}

/** Deletes and returns the row; 404 if it doesn't exist or isn't visible. */
export function deleteAssignment(client: Client, id: string) {
  return one<TeacherAssignment>(
    "teacherAssignments.delete",
    client.from("teacherAssignments").delete().eq("id", id).select(COLUMNS).maybeSingle(),
    assignmentErrors,
  );
}
