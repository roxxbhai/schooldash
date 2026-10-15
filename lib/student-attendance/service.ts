import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forbidden, validationError } from "@/lib/api/errors";
import type { ValidationIssue } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { pageMeta } from "@/lib/db/query";
import {
  attendanceDateSchema,
  attendanceStatusSchema,
  dateFilterShape,
  optionalText,
  refineDateFilters,
  requireChanges,
} from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/student-attendance/repository";

/**
 * Student attendance — one record per student per day.
 *
 * Permissions (route guard + service check + RLS):
 *   - Admins: record, correct and read any class.
 *   - Teachers: record, correct and read only classes they teach (any subject
 *     assignment in the class, or class teacher).
 *   - Students: read their own records only; never write.
 *
 * Rules (also enforced in the database, migration 8):
 *   - the student must be active and enrolled in the class;
 *   - the date must be within the class's academic year and not in the future;
 *   - one record per student per date (409);
 *   - `markedByUserId` is always the acting user, never request data;
 *   - only `status` and `remarks` can be corrected; records are never deleted.
 * Bulk submission is all-or-nothing (one INSERT statement).
 */

type Client = SupabaseClient<Database>;

const recordFields = {
  status: attendanceStatusSchema,
  remarks: optionalText(500),
};

export const createStudentAttendanceSchema = z.strictObject({
  studentId: uuidSchema,
  classId: uuidSchema,
  attendanceDate: attendanceDateSchema,
  ...recordFields,
});

export const MAX_BULK_RECORDS = 200;

export const bulkStudentAttendanceSchema = z
  .strictObject({
    classId: uuidSchema,
    attendanceDate: attendanceDateSchema,
    records: z
      .array(z.strictObject({ studentId: uuidSchema, ...recordFields }))
      .min(1)
      .max(MAX_BULK_RECORDS),
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

export const updateStudentAttendanceSchema = z.strictObject({
  status: attendanceStatusSchema.optional(),
  remarks: optionalText(500),
});

export const listStudentAttendanceQuerySchema = z
  .object({
    classId: uuidSchema.optional(),
    studentId: uuidSchema.optional(),
    status: attendanceStatusSchema.optional(),
    ...dateFilterShape,
  })
  .superRefine(refineDateFilters);

/** Admins may write any class; teachers only classes they teach; students never. */
async function authorizeClassWrite(client: Client, actor: AppUser, classId: string): Promise<void> {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "TEACHER") throw forbidden();
  const teacherId = await findTeacherIdByUserId(client, actor.id);
  if (!teacherId || !(await teacherHasAssignment(client, { teacherId, classId }))) {
    throw forbidden("You can only record attendance for classes you teach.");
  }
}

/**
 * Checks class, date and every student before anything is written.
 * `fieldFor(i)` names the request field for the i-th student in error details.
 */
async function validateRecords(
  client: Client,
  classId: string,
  attendanceDate: string,
  studentIds: string[],
  fieldFor: (index: number) => string,
): Promise<void> {
  const schoolClass = await repo.findClassWithYear(client, classId);
  if (!schoolClass?.academicYear) throw validationError([{ path: "classId", message: "Class not found." }]);
  const { startDate, endDate } = schoolClass.academicYear;
  if (attendanceDate < startDate || attendanceDate > endDate) {
    throw validationError([{ path: "attendanceDate", message: "The date is outside the class's academic year." }]);
  }

  const [active, enrolled] = await Promise.all([
    repo.studentActiveStates(client, studentIds),
    repo.enrolledStudentIds(client, classId, studentIds),
  ]);
  const issues: ValidationIssue[] = [];
  studentIds.forEach((id, index) => {
    if (!active.has(id)) issues.push({ path: fieldFor(index), message: "Student not found." });
    else if (!active.get(id)) issues.push({ path: fieldFor(index), message: "The student's account is deactivated." });
    else if (!enrolled.has(id)) issues.push({ path: fieldFor(index), message: "The student is not enrolled in this class." });
  });
  if (issues.length > 0) throw validationError(issues);
}

export async function recordStudentAttendance(
  client: Client,
  input: z.output<typeof createStudentAttendanceSchema>,
  actor: AppUser,
) {
  await authorizeClassWrite(client, actor, input.classId);
  await validateRecords(client, input.classId, input.attendanceDate, [input.studentId], () => "studentId");
  const [created] = await repo.insertStudentAttendance(client, [{ ...input, markedByUserId: actor.id }]);
  return created;
}

export async function recordClassAttendance(
  client: Client,
  input: z.output<typeof bulkStudentAttendanceSchema>,
  actor: AppUser,
) {
  await authorizeClassWrite(client, actor, input.classId);
  await validateRecords(
    client,
    input.classId,
    input.attendanceDate,
    input.records.map((record) => record.studentId),
    (index) => `records.${index}.studentId`,
  );
  const items = await repo.insertStudentAttendance(
    client,
    input.records.map((record) => ({
      ...record,
      classId: input.classId,
      attendanceDate: input.attendanceDate,
      markedByUserId: actor.id,
    })),
  );
  return { items, count: items.length };
}

export async function correctStudentAttendance(
  client: Client,
  id: string,
  input: z.output<typeof updateStudentAttendanceSchema>,
  actor: AppUser,
) {
  const changes = requireChanges(input);
  const existing = await repo.findStudentAttendance(client, id); // 404 if not visible
  await authorizeClassWrite(client, actor, existing.classId);
  return repo.updateStudentAttendance(client, id, { ...changes, markedByUserId: actor.id });
}

export async function listStudentAttendance(
  client: Client,
  pagination: Pagination,
  filters: repo.StudentAttendanceFilters,
  viewer: AppUser,
) {
  // RLS already limits a student to their own records; asking for someone else is an explicit 403.
  if (viewer.role === "STUDENT" && filters.studentId) {
    await requireStudentOwnership(filters.studentId, { client });
  }
  const { items, total } = await repo.listStudentAttendance(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getStudentAttendance = (client: Client, id: string) => repo.findStudentAttendance(client, id);
