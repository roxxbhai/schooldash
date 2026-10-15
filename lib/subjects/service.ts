import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Pagination } from "@/lib/api/validation";
import { pageMeta } from "@/lib/db/query";
import { optionalText, requireChanges, searchTermSchema } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/subjects/repository";

/**
 * Subjects. Read: any active user. Write: admins. Never deleted — teacher
 * assignments, exams, results and timetables reference them.
 */

type Client = SupabaseClient<Database>;

/** Codes are stored upper-case, e.g. "MATH-10". */
const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, "code may contain only letters, numbers, '-' and '_'.")
  .transform((value) => value.toUpperCase());
const name = z.string().trim().min(1).max(100);

export const createSubjectSchema = z.strictObject({ code, name, description: optionalText(500) });
export const updateSubjectSchema = z.strictObject({
  code: code.optional(),
  name: name.optional(),
  description: optionalText(500),
});
export const listSubjectsQuerySchema = z.object({ search: searchTermSchema.optional() });

export async function listSubjects(client: Client, pagination: Pagination, search?: string) {
  const { items, total } = await repo.listSubjects(client, pagination, search);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getSubject = (client: Client, id: string) => repo.findSubject(client, id);

export const createSubject = (client: Client, input: z.output<typeof createSubjectSchema>) =>
  repo.insertSubject(client, input);

export async function updateSubject(client: Client, id: string, input: z.output<typeof updateSubjectSchema>) {
  return repo.updateSubject(client, id, requireChanges(input));
}
