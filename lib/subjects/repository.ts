import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/** Supabase queries for subjects. Runs as the caller; RLS applies. */

type Client = SupabaseClient<Database>;
export type Subject = Tables<"subjects">;

const COLUMNS = "id, code, name, description, createdAt, updatedAt";

export const subjectErrors: DbErrorContext = {
  notFoundMessage: "Subject not found.",
  constraints: {
    subjects_code_key: { message: "A subject with this code already exists.", field: "code" },
    subjectsCodeNotBlank: { message: "code is required.", field: "code" },
    subjectsNameNotBlank: { message: "name is required.", field: "name" },
  },
};

export function listSubjects(client: Client, pagination: Pagination, search?: string) {
  let query = client.from("subjects").select(COLUMNS, { count: "exact" });
  // `search` is restricted to [letters digits space . _ -] by searchTermSchema, so it
  // cannot inject PostgREST filter syntax (commas, parentheses).
  if (search) query = query.or(`code.ilike.*${search}*,name.ilike.*${search}*`);
  return page<Subject>(
    "subjects.list",
    query.order("code").range(pagination.from, pagination.to),
    subjectErrors,
  );
}

export function findSubject(client: Client, id: string) {
  return one<Subject>("subjects.get", client.from("subjects").select(COLUMNS).eq("id", id).maybeSingle(), subjectErrors);
}

export function insertSubject(client: Client, values: TablesInsert<"subjects">) {
  return one<Subject>("subjects.insert", client.from("subjects").insert(values).select(COLUMNS).maybeSingle(), subjectErrors);
}

export function updateSubject(client: Client, id: string, values: TablesUpdate<"subjects">) {
  return one<Subject>(
    "subjects.update",
    client.from("subjects").update(values).eq("id", id).select(COLUMNS).maybeSingle(),
    subjectErrors,
  );
}
