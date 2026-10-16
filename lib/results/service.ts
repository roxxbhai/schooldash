import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { conflict, forbidden, notFound, validationError } from "@/lib/api/errors";
import type { ValidationIssue } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { orNullIfMissing, pageMeta } from "@/lib/db/query";
import { findExamSubject } from "@/lib/exam-subjects/repository";
import type { ExamSubject } from "@/lib/exam-subjects/repository";
import { marksSchema, optionalText, referenced } from "@/lib/school/validation";
import { enrolledStudentIds } from "@/lib/enrollments/repository";
import { studentActiveStates } from "@/lib/students/repository";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/results/repository";

/**
 * Results: a student's marks for one exam paper (exam × class × subject).
 *
 * Permissions (route guard + service check + RLS):
 *   - Admins: enter, correct and read any marks.
 *   - Teachers: enter, correct and read marks only for papers whose class AND
 *     subject they are assigned to (class teachers without that subject
 *     assignment cannot).
 *   - Students: read their own marks only; never write.
 *
 * Rules:
 *   - the paper must exist; the student must be active and enrolled in the
 *     paper's class (the class is always taken from the paper);
 *   - 0 ≤ marksObtained ≤ maxMarks, at most two decimals; 0 is a real mark.
 *     There is no "absent" state in the schema: a missing mark is simply a
 *     result that has not been entered;
 *   - one result per student per paper (409);
 *   - enteredByUserId is always the acting user;
 *   - only marksObtained and remarks can change (column grants), and a
 *     correction must quote the `updatedAt` it last saw — a stale write is
 *     rejected with 409 instead of silently overwriting another edit;
 *   - entries and corrections are audited; results are never deleted.
 * Bulk entry is all-or-nothing (one INSERT statement).
 */

type Client = SupabaseClient<Database>;

const recordFields = { marksObtained: marksSchema, remarks: optionalText(500) };

export const createResultSchema = z.strictObject({ examSubjectId: uuidSchema, studentId: uuidSchema, ...recordFields });

export const MAX_BULK_RESULTS = 200;

export const bulkResultsSchema = z
  .strictObject({
    examSubjectId: uuidSchema,
    records: z.array(z.strictObject({ studentId: uuidSchema, ...recordFields })).min(1).max(MAX_BULK_RESULTS),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.records.forEach((record, index) => {
      if (seen.has(record.studentId)) {
        ctx.addIssue({ code: "custom", path: ["records", index, "studentId"], message: "Duplicate student in this submission." });
      }
      seen.add(record.studentId);
    });
  });

export const updateResultSchema = z
  .strictObject({
    marksObtained: marksSchema.optional(),
    remarks: optionalText(500),
    /** The `updatedAt` value the client last read (optimistic concurrency). */
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => v.marksObtained !== undefined || v.remarks !== undefined, {
    path: [""],
    message: "Provide marksObtained and/or remarks.",
  });

export const listResultsQuerySchema = z.object({
  examId: uuidSchema.optional(),
  examSubjectId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
});

/** Admins: any paper. Teachers: only papers whose class + subject they teach. */
async function authorizePaperWrite(client: Client, actor: AppUser, paper: ExamSubject): Promise<void> {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "TEACHER") throw forbidden();
  const teacherId = await findTeacherIdByUserId(client, actor.id);
  const assigned =
    teacherId !== null &&
    (await teacherHasAssignment(client, { teacherId, classId: paper.classId, subjectId: paper.subjectId }));
  if (!assigned) throw forbidden("You can only enter marks for subjects you teach in that class.");
}

async function validateMarks(
  client: Client,
  paper: ExamSubject,
  records: { studentId: string; marksObtained: number }[],
  fieldFor: (index: number, field: string) => string,
): Promise<void> {
  const studentIds = records.map((r) => r.studentId);
  const [active, enrolled] = await Promise.all([
    studentActiveStates(client, studentIds),
    enrolledStudentIds(client, paper.classId, studentIds),
  ]);
  const issues: ValidationIssue[] = [];
  records.forEach((record, index) => {
    if (record.marksObtained > paper.maxMarks) {
      issues.push({ path: fieldFor(index, "marksObtained"), message: `marksObtained must not exceed maxMarks (${paper.maxMarks}).` });
    }
    if (!active.has(record.studentId)) issues.push({ path: fieldFor(index, "studentId"), message: "Student not found." });
    else if (!active.get(record.studentId)) issues.push({ path: fieldFor(index, "studentId"), message: "The student's account is deactivated." });
    else if (!enrolled.has(record.studentId)) {
      issues.push({ path: fieldFor(index, "studentId"), message: "The student is not enrolled in the exam subject's class." });
    }
  });
  if (issues.length > 0) throw validationError(issues);
}

/**
 * The paper a write targets. Admins see every paper, so a missing one is a 422.
 * For teachers RLS hides papers of classes they don't teach; that is reported
 * as 403 — the same answer whether or not the paper exists, so existence is
 * not revealed.
 */
async function paperFor(client: Client, examSubjectId: string, actor: AppUser): Promise<ExamSubject> {
  try {
    return await referenced(findExamSubject(client, examSubjectId), "examSubjectId", "Exam subject not found.");
  } catch (error) {
    if (actor.role !== "ADMIN") throw forbidden("You can only enter marks for subjects you teach in that class.");
    throw error;
  }
}

export async function enterResult(client: Client, input: z.output<typeof createResultSchema>, actor: AppUser) {
  const paper = await paperFor(client, input.examSubjectId, actor);
  await authorizePaperWrite(client, actor, paper);
  await validateMarks(client, paper, [input], (_i, field) => field);
  const [created] = await repo.insertResults(client, [{ ...input, classId: paper.classId, enteredByUserId: actor.id }]);
  return created;
}

export async function enterResults(client: Client, input: z.output<typeof bulkResultsSchema>, actor: AppUser) {
  const paper = await paperFor(client, input.examSubjectId, actor);
  await authorizePaperWrite(client, actor, paper);
  await validateMarks(client, paper, input.records, (index, field) => `records.${index}.${field}`);
  const items = await repo.insertResults(
    client,
    input.records.map((record) => ({ ...record, examSubjectId: paper.id, classId: paper.classId, enteredByUserId: actor.id })),
  );
  return { items, count: items.length };
}

export async function correctResult(
  client: Client,
  id: string,
  input: z.output<typeof updateResultSchema>,
  actor: AppUser,
) {
  const existing = await repo.findResult(client, id); // 404 if missing or not visible
  const paper = await findExamSubject(client, existing.examSubjectId);
  await authorizePaperWrite(client, actor, paper);
  if (input.marksObtained !== undefined && input.marksObtained > paper.maxMarks) {
    throw validationError([{ path: "marksObtained", message: `marksObtained must not exceed maxMarks (${paper.maxMarks}).` }]);
  }

  const { expectedUpdatedAt, ...changes } = input;
  const updated = await repo.updateResultIfUnchanged(client, id, expectedUpdatedAt, { ...changes, enteredByUserId: actor.id });
  if (updated) return updated;

  // Nothing matched: either the row changed since the client read it, or it vanished.
  const current = await orNullIfMissing(repo.findResult(client, id));
  if (!current) throw notFound("Result not found.");
  throw conflict("These marks were changed by someone else since you loaded them. Reload and try again.");
}

export async function listResults(client: Client, pagination: Pagination, filters: repo.ResultFilters, viewer: AppUser) {
  if (viewer.role === "STUDENT" && filters.studentId) await requireStudentOwnership(filters.studentId, { client });
  const { items, total } = await repo.listResults(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getResult = (client: Client, id: string) => repo.findResult(client, id);
