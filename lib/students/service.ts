import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { provisionAccount } from "@/lib/auth/provisioning";
import type { AppUser } from "@/lib/auth/session";
import { pageMeta } from "@/lib/db/query";
import { definedOnly, optionalText, requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/students/repository";

/**
 * Student management.
 *
 * - Create: admins, through the trusted provisioning service (role fixed to
 *   STUDENT here; Auth + database with compensation on failure).
 * - Read: admins (all); teachers (students they teach — RLS); a student
 *   (only themselves — ownership check, then RLS).
 * - Update: admins, atomically across users + students.
 * - Deactivate/reactivate: POST /api/users/{userId}/deactivate|reactivate.
 *   Students are never deleted (enrollments, attendance, results, audit).
 */

type Client = SupabaseClient<Database>;

const fullName = z.string().trim().min(1).max(200);
const admissionNumber = z.string().trim().min(1).max(50);
const date = z.iso.date();

const profileFields = {
  admissionDate: date,
  dateOfBirth: date,
  gender: z.string().trim().min(1).max(30),
  bloodGroup: z.string().trim().min(1).max(10),
  fatherName: z.string().trim().min(1).max(200),
  motherName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
};

export const createStudentSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName,
  /** Optional initial password (12–72 chars). Without one, the student sets it via password reset. */
  password: z.string().min(12).max(72).optional(),
  admissionNumber,
  admissionDate: profileFields.admissionDate.optional(),
  dateOfBirth: profileFields.dateOfBirth.optional(),
  gender: profileFields.gender.optional(),
  bloodGroup: profileFields.bloodGroup.optional(),
  fatherName: profileFields.fatherName.optional(),
  motherName: profileFields.motherName.optional(),
  address: profileFields.address.optional(),
});

export const updateStudentSchema = z.strictObject({
  fullName: fullName.optional(),
  phone: optionalText(30),
  admissionNumber: admissionNumber.optional(),
  admissionDate: date.nullable().optional(),
  dateOfBirth: date.nullable().optional(),
  gender: optionalText(30),
  bloodGroup: optionalText(10),
  fatherName: optionalText(200),
  motherName: optionalText(200),
  address: optionalText(500),
});

export const listStudentsQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  classId: uuidSchema.optional(),
});

/** An enrolled student must exist and be active. */
export async function assertActiveStudent(client: Client, studentId: string, field = "studentId"): Promise<void> {
  const student = await repo.findStudentStatus(client, studentId);
  if (!student) throw validationError([{ path: field, message: "Student not found." }]);
  if (!student.user?.isActive) {
    throw validationError([{ path: field, message: "The student's account is deactivated." }]);
  }
}

export async function listStudents(client: Client, pagination: Pagination, filters: repo.StudentFilters) {
  const { items, total } = await repo.listStudents(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export async function getStudent(client: Client, id: string, viewer: AppUser) {
  // A student may read only their own record (403 otherwise). Admin and
  // teacher visibility is decided by RLS: an out-of-scope student is a 404.
  if (viewer.role === "STUDENT") await requireStudentOwnership(id, { client });
  return repo.findStudent(client, id);
}

export async function createStudent(client: Client, input: z.output<typeof createStudentSchema>, actor: AppUser) {
  const { email, fullName: name, password, ...profile } = input;
  const account = await provisionAccount(
    { role: "STUDENT", email, fullName: name, password, profile },
    { actorUserId: actor.id },
  );
  return repo.findStudentByUserId(client, account.userId);
}

export async function updateStudent(client: Client, id: string, input: z.output<typeof updateStudentSchema>) {
  const { fullName: name, phone, ...profile } = requireChanges(input);
  await repo.updateStudentProfile(client, id, definedOnly({ fullName: name, phone }), definedOnly(profile));
  return repo.findStudent(client, id);
}
