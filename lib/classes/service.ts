import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { pageMeta } from "@/lib/db/query";
import { optionalText, requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/classes/repository";
import { assertActiveTeacher } from "@/lib/teachers/service";

/**
 * Classes (a grade + section within one academic year).
 *
 * - Read: admins (all), teachers (classes they teach), students (their class);
 *   the scoping is done by RLS, so an out-of-scope class is a 404.
 * - Write: admins.
 * - `academicYearId` is fixed at creation: moving a class to another year
 *   would orphan its enrollments and exam papers. Classes are never deleted.
 * - A class teacher must be an existing, ACTIVE teacher.
 */

type Client = SupabaseClient<Database>;

const name = z.string().trim().min(1).max(20);
const section = z.string().trim().min(1).max(10);

export const createClassSchema = z.strictObject({
  academicYearId: uuidSchema,
  name,
  section,
  classTeacherId: uuidSchema.nullable().optional(),
  roomNumber: optionalText(20),
});

export const updateClassSchema = z.strictObject({
  name: name.optional(),
  section: section.optional(),
  classTeacherId: uuidSchema.nullable().optional(),
  roomNumber: optionalText(20),
});

export const listClassesQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

export async function listClasses(client: Client, pagination: Pagination, filters: repo.ClassFilters) {
  const { items, total } = await repo.listClasses(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getClass = (client: Client, id: string) => repo.findClass(client, id);

export async function createClass(client: Client, input: z.output<typeof createClassSchema>) {
  await assertActiveTeacher(client, input.classTeacherId, "classTeacherId");
  return repo.insertClass(client, input);
}

export async function updateClass(client: Client, id: string, input: z.output<typeof updateClassSchema>) {
  const changes = requireChanges(input);
  await assertActiveTeacher(client, changes.classTeacherId, "classTeacherId");
  return repo.updateClass(client, id, changes);
}
