import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Supabase queries for classes. Runs as the caller, so RLS scopes reads:
 * admins see all classes, teachers the classes they teach, students the
 * classes they are enrolled in.
 */

type Client = SupabaseClient<Database>;
export type SchoolClass = Tables<"classes">;

const COLUMNS = "id, academicYearId, name, section, classTeacherId, roomNumber, createdAt, updatedAt";

export const classErrors: DbErrorContext = {
  notFoundMessage: "Class not found.",
  constraints: {
    classesNameSectionPerYearKey: {
      message: "A class with this name and section already exists in that academic year.",
    },
    classes_academicYearId_fkey: { message: "Academic year not found.", field: "academicYearId" },
    classes_classTeacherId_fkey: { message: "Teacher not found.", field: "classTeacherId" },
  },
};

export interface ClassFilters {
  academicYearId?: string;
}

export function listClasses(client: Client, pagination: Pagination, filters: ClassFilters) {
  let query = client.from("classes").select(COLUMNS, { count: "exact" });
  if (filters.academicYearId) query = query.eq("academicYearId", filters.academicYearId);
  return page<SchoolClass>(
    "classes.list",
    query.order("name").order("section").order("id").range(pagination.from, pagination.to),
    classErrors,
  );
}

export function findClass(client: Client, id: string) {
  return one<SchoolClass>("classes.get", client.from("classes").select(COLUMNS).eq("id", id).maybeSingle(), classErrors);
}

export function insertClass(client: Client, values: TablesInsert<"classes">) {
  return one<SchoolClass>("classes.insert", client.from("classes").insert(values).select(COLUMNS).maybeSingle(), classErrors);
}

export function updateClass(client: Client, id: string, values: TablesUpdate<"classes">) {
  return one<SchoolClass>(
    "classes.update",
    client.from("classes").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    classErrors,
  );
}

