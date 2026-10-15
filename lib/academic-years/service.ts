import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pageMeta } from "@/lib/db/query";
import type { Pagination } from "@/lib/api/validation";
import { requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/academic-years/repository";

/**
 * Academic years. Read: any active user. Write: admins (enforced by the
 * route guard AND by RLS). Years are never deleted — classes, enrollments and
 * exams reference them — and "current" is switched atomically.
 */

type Client = SupabaseClient<Database>;

const name = z.string().trim().min(1).max(50);
const date = z.iso.date();

export const createAcademicYearSchema = z
  .strictObject({ name, startDate: date, endDate: date })
  .refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "endDate must be after startDate." });

export const updateAcademicYearSchema = z
  .strictObject({ name: name.optional(), startDate: date.optional(), endDate: date.optional() })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    path: ["endDate"],
    message: "endDate must be after startDate.",
  });

export async function listAcademicYears(client: Client, pagination: Pagination) {
  const { items, total } = await repo.listAcademicYears(client, pagination);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getAcademicYear = (client: Client, id: string) => repo.findAcademicYear(client, id);

export const createAcademicYear = (client: Client, input: z.output<typeof createAcademicYearSchema>) =>
  repo.insertAcademicYear(client, input);

export async function updateAcademicYear(client: Client, id: string, input: z.output<typeof updateAcademicYearSchema>) {
  return repo.updateAcademicYear(client, id, requireChanges(input));
}

/** Makes `id` the only current academic year, in one transaction. */
export async function makeCurrentAcademicYear(client: Client, id: string) {
  await repo.setCurrentAcademicYear(client, id);
  return repo.findAcademicYear(client, id);
}
