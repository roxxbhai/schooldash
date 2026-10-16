import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { teacherHasAssignment } from "@/lib/auth/repository";
import { findClass } from "@/lib/classes/repository";
import { pageMeta } from "@/lib/db/query";
import { optionalText, referenced, requireChanges } from "@/lib/school/validation";
import { findSubject } from "@/lib/subjects/repository";
import type { Database } from "@/lib/supabase/database.types";
import { assertActiveTeacher } from "@/lib/teachers/service";
import * as repo from "@/lib/timetable/repository";

/**
 * Timetable: weekly recurring periods for a class.
 *
 * - Read: RLS-scoped (admins all; teachers their own periods and those of
 *   classes they teach; students their classes'). Write: admins only (route
 *   guard + RLS). Teachers cannot change any timetable, including their own.
 * - dayOfWeek is ISO 8601: 1 = Monday … 7 = Sunday.
 * - Times are school-local wall-clock times without a time zone. Requests use
 *   "HH:MM" or "HH:MM:SS" (24-hour); responses return "HH:MM:SS".
 *   startTime must be before endTime.
 * - The class and subject must exist. A teacher is optional (an unstaffed
 *   period); when given, the teacher must be active and hold a teacher
 *   assignment for exactly that class and subject (also enforced by a
 *   composite foreign key).
 * - The academic year is taken from the class by the database.
 * - Conflicts (database exclusion constraints, so concurrent requests cannot
 *   both succeed): a class cannot have overlapping periods on the same day; a
 *   teacher cannot have overlapping periods on the same day in the same
 *   academic year. Periods are half-open, so back-to-back periods (one ends
 *   09:45, the next starts 09:45) do not conflict. → 409.
 * - Updates are validated against the resulting complete entry. An entry
 *   never conflicts with itself.
 * - Entries are configuration, not history: admins may delete them. Every
 *   insert, update and delete is audited.
 * Not modelled (no schema support or requirement): rooms as a constrained
 * resource, dated exceptions/holidays, timetable versions, a curriculum of
 * which subjects a class takes.
 */

type Client = SupabaseClient<Database>;

/** "HH:MM" or "HH:MM:SS", 24-hour; normalised to "HH:MM:SS". */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use 24-hour "HH:MM" or "HH:MM:SS".')
  .transform((value) => (value.length === 5 ? `${value}:00` : value));

export const dayOfWeekSchema = z.number().int().min(1).max(7);

const endAfterStart = (v: { startTime?: string; endTime?: string }) => !v.startTime || !v.endTime || v.endTime > v.startTime;
const endAfterStartIssue = { path: ["endTime"], message: "endTime must be after startTime." };

export const createTimetableEntrySchema = z
  .strictObject({
    classId: uuidSchema,
    subjectId: uuidSchema,
    teacherId: uuidSchema.nullable().optional(),
    dayOfWeek: dayOfWeekSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    room: optionalText(50),
  })
  .refine(endAfterStart, endAfterStartIssue);

export const updateTimetableEntrySchema = z.strictObject({
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  teacherId: uuidSchema.nullable().optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  room: optionalText(50),
});

export const listTimetableQuerySchema = z.object({
  academicYearId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  teacherId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  dayOfWeek: z.coerce.number().pipe(dayOfWeekSchema).optional(),
});

interface Staffing {
  classId: string;
  subjectId: string;
  teacherId: string | null;
}

/** The teacher (if any) must be active and assigned to exactly this class + subject. */
async function assertStaffing(client: Client, { classId, subjectId, teacherId }: Staffing): Promise<void> {
  if (!teacherId) return;
  await assertActiveTeacher(client, teacherId);
  if (!(await teacherHasAssignment(client, { teacherId, classId, subjectId }))) {
    throw validationError([{ path: "teacherId", message: "The teacher is not assigned to teach this subject in this class." }]);
  }
}

export async function listTimetableEntries(client: Client, pagination: Pagination, filters: repo.TimetableFilters) {
  const { items, total } = await repo.listTimetableEntries(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getTimetableEntry = (client: Client, id: string) => repo.findTimetableEntry(client, id);

export async function createTimetableEntry(client: Client, input: z.output<typeof createTimetableEntrySchema>) {
  await referenced(findClass(client, input.classId), "classId", "Class not found.");
  await referenced(findSubject(client, input.subjectId), "subjectId", "Subject not found.");
  const teacherId = input.teacherId ?? null;
  await assertStaffing(client, { classId: input.classId, subjectId: input.subjectId, teacherId });
  return repo.insertTimetableEntry(client, { ...input, teacherId });
}

export async function updateTimetableEntry(client: Client, id: string, input: z.output<typeof updateTimetableEntrySchema>) {
  const changes = requireChanges(input);
  const current = await repo.findTimetableEntry(client, id);
  const next = {
    classId: changes.classId ?? current.classId,
    subjectId: changes.subjectId ?? current.subjectId,
    teacherId: "teacherId" in changes ? (changes.teacherId ?? null) : current.teacherId,
    startTime: changes.startTime ?? current.startTime,
    endTime: changes.endTime ?? current.endTime,
  };

  if (next.endTime <= next.startTime) {
    throw validationError([{ path: changes.endTime ? "endTime" : "startTime", message: "endTime must be after startTime." }]);
  }
  if (changes.classId && changes.classId !== current.classId) {
    await referenced(findClass(client, changes.classId), "classId", "Class not found.");
  }
  if (changes.subjectId && changes.subjectId !== current.subjectId) {
    await referenced(findSubject(client, changes.subjectId), "subjectId", "Subject not found.");
  }
  const staffingChanged =
    next.classId !== current.classId || next.subjectId !== current.subjectId || next.teacherId !== current.teacherId;
  if (staffingChanged) await assertStaffing(client, next);

  return repo.updateTimetableEntry(client, id, changes);
}

export const removeTimetableEntry = (client: Client, id: string) => repo.deleteTimetableEntry(client, id);
