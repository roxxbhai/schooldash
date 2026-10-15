import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page, rpcResult } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/** Supabase queries for academic years. Runs as the caller; RLS applies. */

type Client = SupabaseClient<Database>;
export type AcademicYear = Tables<"academicYears">;

const COLUMNS = "id, name, startDate, endDate, isCurrent, createdAt, updatedAt";

export const academicYearErrors: DbErrorContext = {
  notFoundMessage: "Academic year not found.",
  constraints: {
    academicYears_name_key: { message: "An academic year with this name already exists.", field: "name" },
    academicYearsDateRange: { message: "endDate must be after startDate.", field: "endDate" },
    academicYearsSingleCurrentKey: { message: "Another academic year is already current." },
  },
};

export function listAcademicYears(client: Client, pagination: Pagination) {
  return page<AcademicYear>(
    "academicYears.list",
    client
      .from("academicYears")
      .select(COLUMNS, { count: "exact" })
      .order("startDate", { ascending: false })
      .order("id") // unique tiebreaker: stable pages
      .range(pagination.from, pagination.to),
    academicYearErrors,
  );
}

export function findAcademicYear(client: Client, id: string) {
  return one<AcademicYear>(
    "academicYears.get",
    client.from("academicYears").select(COLUMNS).eq("id", id).maybeSingle(),
    academicYearErrors,
  );
}

export function insertAcademicYear(client: Client, values: TablesInsert<"academicYears">) {
  return one<AcademicYear>(
    "academicYears.insert",
    client.from("academicYears").insert(values).select(COLUMNS).maybeSingle(),
    academicYearErrors,
  );
}

export function updateAcademicYear(client: Client, id: string, values: TablesUpdate<"academicYears">) {
  return one<AcademicYear>(
    "academicYears.update",
    client.from("academicYears").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    academicYearErrors,
  );
}

export async function setCurrentAcademicYear(client: Client, id: string): Promise<void> {
  await rpcResult("academicYears.setCurrent", client.rpc("setCurrentAcademicYear", { academicYearId: id }), academicYearErrors);
}

