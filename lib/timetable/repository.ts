import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Supabase queries for timetable entries. Runs as the caller, so RLS scopes
 * reads: admins all; a teacher their own periods and those of classes they
 * teach; a student those of classes they are enrolled in. Writes: admins.
 */

type Client = SupabaseClient<Database>;
export type TimetableEntry = Tables<"timetableEntries">;

const COLUMNS =
  "id, academicYearId, classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room, createdAt, updatedAt";

export const timetableErrors: DbErrorContext = {
  notFoundMessage: "Timetable entry not found.",
  constraints: {
    timetableEntriesClassNoOverlap: { message: "The class already has a period that overlaps this time." },
    timetableEntriesClassSlotKey: { message: "The class already has a period that overlaps this time." },
    timetableEntriesTeacherNoOverlap: { message: "The teacher already has a period that overlaps this time." },
    timetableEntriesAssignmentFkey: {
      message: "The teacher is not assigned to teach this subject in this class.",
      field: "teacherId",
    },
    timetableEntries_classId_fkey: { message: "Class not found.", field: "classId" },
    timetableEntries_subjectId_fkey: { message: "Subject not found.", field: "subjectId" },
    timetableEntries_teacherId_fkey: { message: "Teacher not found.", field: "teacherId" },
    timetableEntriesTimeRange: { message: "endTime must be after startTime.", field: "endTime" },
    timetableEntriesDayOfWeekRange: { message: "dayOfWeek must be between 1 and 7.", field: "dayOfWeek" },
  },
};

export interface TimetableFilters {
  academicYearId?: string;
  classId?: string;
  teacherId?: string;
  subjectId?: string;
  dayOfWeek?: number;
}

export function listTimetableEntries(client: Client, pagination: Pagination, filters: TimetableFilters) {
  let query = client.from("timetableEntries").select(COLUMNS, { count: "exact" });
  if (filters.academicYearId) query = query.eq("academicYearId", filters.academicYearId);
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.teacherId) query = query.eq("teacherId", filters.teacherId);
  if (filters.subjectId) query = query.eq("subjectId", filters.subjectId);
  if (filters.dayOfWeek) query = query.eq("dayOfWeek", filters.dayOfWeek);
  return page<TimetableEntry>(
    "timetableEntries.list",
    query
      .order("dayOfWeek")
      .order("startTime")
      .order("classId")
      .order("id")
      .range(pagination.from, pagination.to),
    timetableErrors,
  );
}

export function findTimetableEntry(client: Client, id: string) {
  return one<TimetableEntry>(
    "timetableEntries.get",
    client.from("timetableEntries").select(COLUMNS).eq("id", id).maybeSingle(),
    timetableErrors,
  );
}

/** academicYearId is set by the database from the class. */
export function insertTimetableEntry(client: Client, values: Omit<TablesInsert<"timetableEntries">, "academicYearId">) {
  return one<TimetableEntry>(
    "timetableEntries.insert",
    client
      .from("timetableEntries")
      .insert(values as TablesInsert<"timetableEntries">)
      .select(COLUMNS)
      .maybeSingle(),
    timetableErrors,
  );
}

export function updateTimetableEntry(client: Client, id: string, values: TablesUpdate<"timetableEntries">) {
  return one<TimetableEntry>(
    "timetableEntries.update",
    client.from("timetableEntries").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    timetableErrors,
  );
}

/** Deletes and returns the row; 404 if it doesn't exist or isn't visible. */
export function deleteTimetableEntry(client: Client, id: string) {
  return one<TimetableEntry>(
    "timetableEntries.delete",
    client.from("timetableEntries").delete().eq("id", id).select(COLUMNS).maybeSingle(),
    timetableErrors,
  );
}
