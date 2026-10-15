import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError, validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import type { AppUser } from "@/lib/auth/session";
import { findClass } from "@/lib/classes/repository";
import { pageMeta } from "@/lib/db/query";
import { requireChanges } from "@/lib/school/validation";
import { assertActiveStudent } from "@/lib/students/service";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/enrollments/repository";

/**
 * Student enrollments: one class per student per academic year.
 *
 * - Read: admins (all), teachers (classes they teach — RLS), a student (their
 *   own; filtering by another student's id is a 403).
 * - Create / update: admins. The academic year is always taken from the class,
 *   never from the request. Only active students can be enrolled.
 * - A student can be moved to another class of the SAME year, unless the
 *   enrollment already has attendance or results (409). Past years'
 *   enrollments are kept; enrollments are never deleted.
 */

type Client = SupabaseClient<Database>;

const rollNumber = z.number().int().positive().max(100000);

export const createEnrollmentSchema = z.strictObject({
  studentId: uuidSchema,
  classId: uuidSchema,
  rollNumber: rollNumber.optional(),
});

export const updateEnrollmentSchema = z.strictObject({
  classId: uuidSchema.optional(),
  rollNumber: rollNumber.nullable().optional(),
});

export const listEnrollmentsQuerySchema = z.object({
  studentId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  academicYearId: uuidSchema.optional(),
});

/** A class referenced in a request body: missing → 422 on that field. */
async function classForBody(client: Client, classId: string) {
  try {
    return await findClass(client, classId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw validationError([{ path: "classId", message: "Class not found." }]);
    }
    throw error;
  }
}

export async function listEnrollments(
  client: Client,
  pagination: Pagination,
  filters: repo.EnrollmentFilters,
  viewer: AppUser,
) {
  // RLS already limits a student to their own rows; asking for someone else is an explicit 403.
  if (viewer.role === "STUDENT" && filters.studentId) {
    await requireStudentOwnership(filters.studentId, { client });
  }
  const { items, total } = await repo.listEnrollments(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getEnrollment = (client: Client, id: string) => repo.findEnrollment(client, id);

export async function createEnrollment(client: Client, input: z.output<typeof createEnrollmentSchema>) {
  await assertActiveStudent(client, input.studentId);
  const schoolClass = await classForBody(client, input.classId);
  return repo.insertEnrollment(client, {
    studentId: input.studentId,
    classId: schoolClass.id,
    academicYearId: schoolClass.academicYearId,
    rollNumber: input.rollNumber,
  });
}

export async function updateEnrollment(client: Client, id: string, input: z.output<typeof updateEnrollmentSchema>) {
  const changes = requireChanges(input);
  if (changes.classId) {
    const current = await repo.findEnrollment(client, id);
    const target = await classForBody(client, changes.classId);
    if (target.academicYearId !== current.academicYearId) {
      throw validationError([
        { path: "classId", message: "A student can only be moved to a class in the same academic year." },
      ]);
    }
  }
  return repo.updateEnrollment(client, id, changes);
}
