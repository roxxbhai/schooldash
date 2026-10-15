import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { conflict, validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { findAcademicYear } from "@/lib/academic-years/repository";
import { findClass } from "@/lib/classes/repository";
import { pageMeta } from "@/lib/db/query";
import { findExam } from "@/lib/exams/repository";
import type { Exam } from "@/lib/exams/repository";
import { marksSchema, referenced, requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/exam-subjects/repository";

/**
 * Exam papers: a subject configured for an exam and a class.
 *
 * - Read: RLS-scoped (admins all; teachers classes they teach; students their
 *   class). Write: admins (route guard + RLS).
 * - The class must belong to the exam's academic year; the academic year is
 *   always taken from the exam. exam, class and subject are fixed at creation
 *   (column grants, migration 9) so existing results can never be relabelled.
 * - maxMarks > 0; passMarks optional, 0 ≤ passMarks ≤ maxMarks.
 * - maxMarks may only be lowered while no entered mark exceeds it (409).
 * - examDate, if given, must fall within the exam's dates (or, if the exam
 *   has none, its academic year).
 * - One configuration per exam + class + subject (409). Never deleted.
 */

type Client = SupabaseClient<Database>;

const optionalPassMarks = marksSchema.nullable().optional();

export const createExamSubjectSchema = z
  .strictObject({
    examId: uuidSchema,
    classId: uuidSchema,
    subjectId: uuidSchema,
    maxMarks: marksSchema.refine((value) => value > 0, "maxMarks must be greater than 0."),
    passMarks: optionalPassMarks,
    examDate: z.iso.date().optional(),
  })
  .refine((v) => v.passMarks == null || v.passMarks <= v.maxMarks, {
    path: ["passMarks"],
    message: "passMarks must be between 0 and maxMarks.",
  });

export const updateExamSubjectSchema = z.strictObject({
  maxMarks: marksSchema.refine((value) => value > 0, "maxMarks must be greater than 0.").optional(),
  passMarks: optionalPassMarks,
  examDate: z.iso.date().nullable().optional(),
});

export const listExamSubjectsQuerySchema = z.object({
  examId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
});

async function assertExamDate(client: Client, exam: Exam, examDate: string | null | undefined) {
  if (!examDate) return;
  const window =
    exam.startDate && exam.endDate
      ? { start: exam.startDate, end: exam.endDate, label: "the exam's dates" }
      : await findAcademicYear(client, exam.academicYearId).then((y) => ({ start: y.startDate, end: y.endDate, label: "the exam's academic year" }));
  if (examDate < window.start || examDate > window.end) {
    throw validationError([{ path: "examDate", message: `examDate must be within ${window.label}.` }]);
  }
}

export async function listExamSubjects(client: Client, pagination: Pagination, filters: repo.ExamSubjectFilters) {
  const { items, total } = await repo.listExamSubjects(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getExamSubject = (client: Client, id: string) => repo.findExamSubject(client, id);

export async function createExamSubject(client: Client, input: z.output<typeof createExamSubjectSchema>) {
  const exam = await referenced(findExam(client, input.examId), "examId", "Exam not found.");
  const schoolClass = await referenced(findClass(client, input.classId), "classId", "Class not found.");
  if (schoolClass.academicYearId !== exam.academicYearId) {
    throw validationError([{ path: "classId", message: "The class is not in the exam's academic year." }]);
  }
  await assertExamDate(client, exam, input.examDate);
  return repo.insertExamSubject(client, { ...input, academicYearId: exam.academicYearId });
}

export async function updateExamSubject(client: Client, id: string, input: z.output<typeof updateExamSubjectSchema>) {
  const changes = requireChanges(input);
  const current = await repo.findExamSubject(client, id);

  const maxMarks = changes.maxMarks ?? current.maxMarks;
  const passMarks = "passMarks" in changes ? changes.passMarks : current.passMarks;
  if (passMarks != null && passMarks > maxMarks) {
    throw validationError([{ path: "passMarks", message: "passMarks must be between 0 and maxMarks." }]);
  }
  if (changes.maxMarks !== undefined && changes.maxMarks < current.maxMarks) {
    const highest = await repo.highestMark(client, id);
    if (highest !== null && highest > changes.maxMarks) {
      throw conflict(`Marks up to ${highest} have already been entered; maxMarks cannot be lower than that.`);
    }
  }
  if ("examDate" in changes) await assertExamDate(client, await findExam(client, current.examId), changes.examDate);
  return repo.updateExamSubject(client, id, changes);
}
