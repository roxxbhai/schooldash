import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/** Supabase queries for exams. Runs as the caller; RLS applies (any active user reads). */

type Client = SupabaseClient<Database>;
export type Exam = Tables<"exams">;

const COLUMNS = "id, academicYearId, name, startDate, endDate, createdAt, updatedAt";

export const examErrors: DbErrorContext = {
  notFoundMessage: "Exam not found.",
  constraints: {
    examsNamePerYearKey: { message: "An exam with this name already exists in that academic year.", field: "name" },
    exams_academicYearId_fkey: { message: "Academic year not found.", field: "academicYearId" },
    examsDateRange: { message: "endDate must not be before startDate.", field: "endDate" },
    examsNameNotBlank: { message: "name is required.", field: "name" },
  },
};

export function listExams(client: Client, pagination: Pagination, filters: { academicYearId?: string }) {
  let query = client.from("exams").select(COLUMNS, { count: "exact" });
  if (filters.academicYearId) query = query.eq("academicYearId", filters.academicYearId);
  return page<Exam>(
    "exams.list",
    query
      .order("startDate", { ascending: false, nullsFirst: false })
      .order("name")
      .order("id")
      .range(pagination.from, pagination.to),
    examErrors,
  );
}

export function findExam(client: Client, id: string) {
  return one<Exam>("exams.get", client.from("exams").select(COLUMNS).eq("id", id).maybeSingle(), examErrors);
}

export function insertExam(client: Client, values: TablesInsert<"exams">) {
  return one<Exam>("exams.insert", client.from("exams").insert(values).select(COLUMNS).maybeSingle(), examErrors);
}

export function updateExam(client: Client, id: string, values: TablesUpdate<"exams">) {
  return one<Exam>(
    "exams.update",
    client.from("exams").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    examErrors,
  );
}
