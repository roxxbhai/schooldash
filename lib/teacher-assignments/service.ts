import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { pageMeta } from "@/lib/db/query";
import type { Database } from "@/lib/supabase/database.types";
import { assertActiveTeacher } from "@/lib/teachers/service";
import * as repo from "@/lib/teacher-assignments/repository";

/**
 * Teacher assignments: which teacher teaches which subject to which class.
 * These rows drive every teacher permission check (RLS `app.teachesClass`,
 * `app.teachesClassSubject`), so only admins may create or remove them —
 * a teacher cannot assign themselves (route guard + RLS).
 *
 * - Read: admins (all), a teacher (their own), a student (their class's).
 * - Create: admins; the teacher must be active; class and subject must exist.
 * - Delete: admins; refused (409) while timetable entries use the assignment.
 *   There is no update: change an assignment by removing and re-adding it.
 */

type Client = SupabaseClient<Database>;

export const createAssignmentSchema = z.strictObject({
  teacherId: uuidSchema,
  classId: uuidSchema,
  subjectId: uuidSchema,
});

export const listAssignmentsQuerySchema = z.object({
  teacherId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
});

export async function listAssignments(client: Client, pagination: Pagination, filters: repo.AssignmentFilters) {
  const { items, total } = await repo.listAssignments(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getAssignment = (client: Client, id: string) => repo.findAssignment(client, id);

export async function createAssignment(client: Client, input: z.output<typeof createAssignmentSchema>) {
  await assertActiveTeacher(client, input.teacherId);
  return repo.insertAssignment(client, input);
}

export const removeAssignment = (client: Client, id: string) => repo.deleteAssignment(client, id);
