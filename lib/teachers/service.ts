import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forbidden, validationError } from "@/lib/api/errors";
import type { Pagination } from "@/lib/api/validation";
import { findTeacherIdByUserId } from "@/lib/auth/repository";
import { provisionAccount } from "@/lib/auth/provisioning";
import type { AppUser } from "@/lib/auth/session";
import { pageMeta } from "@/lib/db/query";
import { definedOnly, optionalText, requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/teachers/repository";

/**
 * Teacher management.
 *
 * - Create: admins, through the trusted provisioning service (Auth identity +
 *   users row + teacher profile + audit, with compensation on failure). The
 *   role is fixed to TEACHER by this service — never taken from the request.
 * - Read: admins (all teachers); a teacher (their own record only).
 * - Update: admins, atomically across users + teachers.
 * - Deactivate/reactivate: POST /api/users/{userId}/deactivate|reactivate.
 *   Teachers are never deleted (classes, assignments, attendance, results and
 *   audit logs reference them).
 */

type Client = SupabaseClient<Database>;

const fullName = z.string().trim().min(1).max(200);
const employeeCode = z.string().trim().min(1).max(50);
const date = z.iso.date();

export const createTeacherSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName,
  /** Optional initial password (12–72 chars). Without one, the teacher sets it via password reset. */
  password: z.string().min(12).max(72).optional(),
  employeeCode,
  qualification: z.string().trim().min(1).max(200).optional(),
  dateOfJoining: date.optional(),
});

export const updateTeacherSchema = z.strictObject({
  fullName: fullName.optional(),
  phone: optionalText(30),
  employeeCode: employeeCode.optional(),
  qualification: optionalText(200),
  dateOfJoining: date.nullable().optional(),
});

export const listTeachersQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

/** A class teacher / assignee must exist and be active. */
export async function assertActiveTeacher(
  client: Client,
  teacherId: string | null | undefined,
  field = "teacherId",
): Promise<void> {
  if (!teacherId) return;
  const teacher = await repo.findTeacherStatus(client, teacherId);
  if (!teacher) throw validationError([{ path: field, message: "Teacher not found." }]);
  if (!teacher.user?.isActive) {
    throw validationError([{ path: field, message: "The teacher's account is deactivated." }]);
  }
}

export async function listTeachers(client: Client, pagination: Pagination, filters: repo.TeacherFilters) {
  const { items, total } = await repo.listTeachers(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

/** Admins may read any teacher; a teacher only themselves; students never. */
export async function getTeacher(client: Client, id: string, viewer: AppUser) {
  if (viewer.role === "STUDENT") throw forbidden();
  if (viewer.role === "TEACHER" && (await findTeacherIdByUserId(client, viewer.id)) !== id) throw forbidden();
  return repo.findTeacher(client, id);
}

export async function createTeacher(client: Client, input: z.output<typeof createTeacherSchema>, actor: AppUser) {
  const account = await provisionAccount(
    {
      role: "TEACHER",
      email: input.email,
      fullName: input.fullName,
      password: input.password,
      profile: { employeeCode: input.employeeCode, qualification: input.qualification, dateOfJoining: input.dateOfJoining },
    },
    { actorUserId: actor.id },
  );
  return repo.findTeacherByUserId(client, account.userId);
}

export async function updateTeacher(client: Client, id: string, input: z.output<typeof updateTeacherSchema>) {
  const { fullName: name, phone, ...profile } = requireChanges(input);
  await repo.updateTeacherProfile(client, id, definedOnly({ fullName: name, phone }), definedOnly(profile));
  return repo.findTeacher(client, id);
}
