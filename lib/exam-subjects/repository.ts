import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page } from "@/lib/db/query";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Supabase queries for exam papers (exam × class × subject). Runs as the
 * caller, so RLS scopes reads: admins all, teachers papers of classes they
 * teach, students papers of their class.
 */

type Client = SupabaseClient<Database>;
export type ExamSubject = Tables<"examSubjects">;

export const EXAM_SUBJECT_COLUMNS =
  "id, examId, classId, academicYearId, subjectId, examDate, maxMarks, passMarks, createdAt, updatedAt";

export const examSubjectErrors: DbErrorContext = {
  notFoundMessage: "Exam subject not found.",
  constraints: {
    examSubjectsKey: { message: "This subject is already configured for that exam and class." },
    examSubjectsExamFkey: { message: "Exam not found.", field: "examId" },
    examSubjectsClassFkey: { message: "The class is not in the exam's academic year.", field: "classId" },
    examSubjects_subjectId_fkey: { message: "Subject not found.", field: "subjectId" },
    examSubjectsMaxMarksPositive: { message: "maxMarks must be greater than 0.", field: "maxMarks" },
    examSubjectsPassMarksInRange: { message: "passMarks must be between 0 and maxMarks.", field: "passMarks" },
  },
};

export interface ExamSubjectFilters {
  examId?: string;
  classId?: string;
  subjectId?: string;
}

export function listExamSubjects(client: Client, pagination: Pagination, filters: ExamSubjectFilters) {
  let query = client.from("examSubjects").select(EXAM_SUBJECT_COLUMNS, { count: "exact" });
  if (filters.examId) query = query.eq("examId", filters.examId);
  if (filters.classId) query = query.eq("classId", filters.classId);
  if (filters.subjectId) query = query.eq("subjectId", filters.subjectId);
  return page<ExamSubject>(
    "examSubjects.list",
    query.order("examId").order("classId").order("subjectId").order("id").range(pagination.from, pagination.to),
    examSubjectErrors,
  );
}

export function findExamSubject(client: Client, id: string) {
  return one<ExamSubject>(
    "examSubjects.get",
    client.from("examSubjects").select(EXAM_SUBJECT_COLUMNS).eq("id", id).maybeSingle(),
    examSubjectErrors,
  );
}

export function insertExamSubject(client: Client, values: TablesInsert<"examSubjects">) {
  return one<ExamSubject>(
    "examSubjects.insert",
    client.from("examSubjects").insert(values).select(EXAM_SUBJECT_COLUMNS).maybeSingle(),
    examSubjectErrors,
  );
}

export function updateExamSubject(client: Client, id: string, values: TablesUpdate<"examSubjects">) {
  return one<ExamSubject>(
    "examSubjects.update",
    client.from("examSubjects").update(values).eq("id", id).select(EXAM_SUBJECT_COLUMNS).maybeSingle(),
    examSubjectErrors,
  );
}

/** Highest mark already entered for a paper, or null if none. */
export async function highestMark(client: Client, examSubjectId: string): Promise<number | null> {
  const row = await maybeOne<{ marksObtained: number }>(
    "results.highest",
    client
      .from("results")
      .select("marksObtained")
      .eq("examSubjectId", examSubjectId)
      .order("marksObtained", { ascending: false })
      .limit(1)
      .maybeSingle(),
    examSubjectErrors,
  );
  return row?.marksObtained ?? null;
}

/** Papers of one exam for one class, with subject code/name. */
export function papersForClass(client: Client, examId: string, classId: string) {
  return many<ExamSubject & { subject: { code: string; name: string } | null }>(
    "examSubjects.forClass",
    client
      .from("examSubjects")
      .select(`${EXAM_SUBJECT_COLUMNS}, subject:subjects!examSubjects_subjectId_fkey(code, name)`)
      .eq("examId", examId)
      .eq("classId", classId) as never,
    examSubjectErrors,
  );
}
