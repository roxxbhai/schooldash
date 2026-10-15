import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forbidden } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { findTeacherIdByUserId } from "@/lib/auth/repository";
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
import * as repo from "@/lib/teacher-attendance/repository";
import { assertActiveTeacher } from "@/lib/teachers/service";

/**
 * Teacher attendance — one record per teacher per day.
 *
 * Permissions (route guard + RLS):
 *   - Admins: record, correct and read anyone's attendance.
 *   - Teachers: read only their own records; they cannot record or correct
 *     attendance (their own or anyone else's).
 *   - Students: no access.
 *
 * Rules (also enforced in the database, migration 8): the teacher must exist
 * and be active; the date may not be in the future; one record per teacher
 * per date (409); `markedByUserId` is the acting admin; only `status` and
 * `remarks` can be corrected; records are never deleted.
 */

type Client = SupabaseClient<Database>;

export const createTeacherAttendanceSchema = z.strictObject({
  teacherId: uuidSchema,
  attendanceDate: attendanceDateSchema,
  status: attendanceStatusSchema,
  remarks: optionalText(500),
});

export const updateTeacherAttendanceSchema = z.strictObject({
  status: attendanceStatusSchema.optional(),
  remarks: optionalText(500),
});

export const listTeacherAttendanceQuerySchema = z
  .object({
    teacherId: uuidSchema.optional(),
    status: attendanceStatusSchema.optional(),
    ...dateFilterShape,
  })
  .superRefine(refineDateFilters);

export async function recordTeacherAttendance(
  client: Client,
  input: z.output<typeof createTeacherAttendanceSchema>,
  actor: AppUser,
) {
  await assertActiveTeacher(client, input.teacherId);
  return repo.insertTeacherAttendance(client, { ...input, markedByUserId: actor.id });
}

export async function correctTeacherAttendance(
  client: Client,
  id: string,
  input: z.output<typeof updateTeacherAttendanceSchema>,
  actor: AppUser,
) {
  const changes = requireChanges(input);
  await repo.findTeacherAttendance(client, id); // 404 if it doesn't exist
  return repo.updateTeacherAttendance(client, id, { ...changes, markedByUserId: actor.id });
}

export async function listTeacherAttendance(
  client: Client,
  pagination: Pagination,
  filters: repo.TeacherAttendanceFilters,
  viewer: AppUser,
) {
  // RLS limits a teacher to their own rows; asking for another teacher is an explicit 403.
  if (viewer.role === "TEACHER" && filters.teacherId) {
    if ((await findTeacherIdByUserId(client, viewer.id)) !== filters.teacherId) {
      throw forbidden("Teachers can only view their own attendance.");
    }
  }
  const { items, total } = await repo.listTeacherAttendance(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getTeacherAttendance = (client: Client, id: string) => repo.findTeacherAttendance(client, id);
