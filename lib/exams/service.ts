import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import type { Pagination } from "@/lib/api/validation";
import { findAcademicYear } from "@/lib/academic-years/repository";
import { pageMeta } from "@/lib/db/query";
import { referenced, requireChanges } from "@/lib/school/validation";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/exams/repository";

/**
 * Exams: an examination event within one academic year (e.g. "Term 1").
 *
 * - Read: any active user. Write: admins (route guard + RLS).
 * - The academic year is fixed at creation (column grants, migration 9).
 * - Optional start/end dates must lie within the academic year and in order.
 * - Names are unique per academic year (409).
 * - Exams are never deleted: exam papers and results reference them.
 * No exam types, grading schemes or scheduling rules are defined, so none are
 * enforced.
 */

type Client = SupabaseClient<Database>;

const name = z.string().trim().min(1).max(100);
const date = z.iso.date();

export const createExamSchema = z
  .strictObject({ academicYearId: uuidSchema, name, startDate: date.optional(), endDate: date.optional() })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "endDate must not be before startDate.",
  });

export const updateExamSchema = z.strictObject({
  name: name.optional(),
  startDate: date.nullable().optional(),
  endDate: date.nullable().optional(),
});

export const listExamsQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

function assertDatesInYear(
  dates: { startDate?: string | null; endDate?: string | null },
  year: { startDate: string; endDate: string },
) {
  const { startDate, endDate } = dates;
  if (startDate && endDate && endDate < startDate) {
    throw validationError([{ path: "endDate", message: "endDate must not be before startDate." }]);
  }
  for (const [field, value] of [["startDate", startDate], ["endDate", endDate]] as const) {
    if (value && (value < year.startDate || value > year.endDate)) {
      throw validationError([{ path: field, message: "The date must be within the exam's academic year." }]);
    }
  }
}

export async function listExams(client: Client, pagination: Pagination, filters: { academicYearId?: string }) {
  const { items, total } = await repo.listExams(client, pagination, filters);
  return { items, pagination: pageMeta(pagination, total) };
}

export const getExam = (client: Client, id: string) => repo.findExam(client, id);

export async function createExam(client: Client, input: z.output<typeof createExamSchema>) {
  const year = await referenced(findAcademicYear(client, input.academicYearId), "academicYearId", "Academic year not found.");
  assertDatesInYear(input, year);
  return repo.insertExam(client, input);
}

export async function updateExam(client: Client, id: string, input: z.output<typeof updateExamSchema>) {
  const changes = requireChanges(input);
  const current = await repo.findExam(client, id);
  const year = await findAcademicYear(client, current.academicYearId);
  assertDatesInYear(
    {
      startDate: "startDate" in changes ? changes.startDate : current.startDate,
      endDate: "endDate" in changes ? changes.endDate : current.endDate,
    },
    year,
  );
  return repo.updateExam(client, id, changes);
}
