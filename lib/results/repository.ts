import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";

/**
 * Supabase queries for results (marks). Runs as the caller, so RLS scopes
 * reads and writes: admins all; teachers only papers whose class AND subject
 * they are assigned to; a student only their own marks.
 */

type Client = SupabaseClient<Database>;
export type Result = Tables<"results">;

export const RESULT_COLUMNS =
  "id, examSubjectId, studentId, classId, marksObtained, remarks, enteredByUserId, createdAt, updatedAt";

export const resultErrors: DbErrorContext = {
  notFoundMessage: "Result not found.",
  constraints: {
    resultsExamSubjectStudentKey: { message: "Marks for this student and exam subject already exist." },
    resultsEnrollmentFkey: { message: "The student is not enrolled in the exam subject's class.", field: "studentId" },
    resultsExamSubjectFkey: { message: "Exam subject not found.", field: "examSubjectId" },
    resultsMarksNonNegative: { message: "marksObtained must not be negative.", field: "marksObtained" },
    resultsStudentActive: { message: "The student's account is deactivated.", field: "studentId" },
  },
};

export interface ResultFilters {
  examId?: string;
  examSubjectId?: string;
  classId?: string;
  subjectId?: string;
  studentId?: string;
}

export function listResults(client: Client, pagination: Pagination, filters: ResultFilters) {
  const joinsPaper = Boolean(filters.examId || filters.subjectId);
  // Empty embed: filters by the paper's exam/subject without changing the response shape.
  const columns = joinsPaper ? `${RESULT_COLUMNS}, paper:examSubjects!resultsExamSubjectFkey!inner()` : RESULT_COLUMNS;
  let query = client.from("results").select(columns, { count: "exact" });
  if (filters.examSubjectId) query = query.eq("examSubjectId", filters.examSubjectId);
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.studentId) query = query.eq("studentId", filters.studentId);
  if (filters.examId) query = query.eq("paper.examId", filters.examId);
  if (filters.subjectId) query = query.eq("paper.subjectId", filters.subjectId);
  return page<Result>(
    "results.list",
    query.order("examSubjectId").order("studentId").order("id").range(pagination.from, pagination.to) as never,
    resultErrors,
  );
}

export function findResult(client: Client, id: string) {
  return one<Result>("results.get", client.from("results").select(RESULT_COLUMNS).eq("id", id).maybeSingle(), resultErrors);
}

/** Inserts all rows in ONE statement: either every mark is saved or none is. */
export function insertResults(client: Client, rows: TablesInsert<"results">[]) {
  return many<Result>("results.insert", client.from("results").insert(rows).select(RESULT_COLUMNS), resultErrors);
}

/**
 * Optimistic update: only applies if the row still has `expectedUpdatedAt`.
 * Returns null when nothing matched (row missing, hidden, or changed since).
 */
export function updateResultIfUnchanged(
  client: Client,
  id: string,
  expectedUpdatedAt: string,
  values: { marksObtained?: number; remarks?: string | null; enteredByUserId: string },
) {
  return maybeOne<Result>(
    "results.update",
    client
      .from("results")
      .update(values)
      .eq("id", id)
      .eq("updatedAt", expectedUpdatedAt)
      .select(RESULT_COLUMNS)
      .maybeSingle(),
    resultErrors,
  );
}

/** Marks already entered for one student, for the given papers. */
export function resultsForStudent(client: Client, studentId: string, examSubjectIds: string[]) {
  return many<Result>(
    "results.forStudent",
    client.from("results").select(RESULT_COLUMNS).eq("studentId", studentId).in("examSubjectId", examSubjectIds),
    resultErrors,
  );
}
