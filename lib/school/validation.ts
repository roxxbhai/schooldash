import "server-only";
import { z } from "zod";
import { validationError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/api/validation";
import { Constants } from "@/lib/supabase/database.types";

/** Shared validation pieces for the school-management APIs. */

export const idParamsSchema = z.object({ id: uuidSchema });

/** Rejects an update with no fields (422) and strips undefined keys. */
export function requireChanges<T extends Record<string, unknown>>(input: T): Partial<T> {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw validationError([{ path: "", message: "Provide at least one field to update." }]);
  }
  return Object.fromEntries(entries) as Partial<T>;
}

/** Copies an object without its undefined keys (for jsonb patch arguments). */
export function definedOnly(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<
    string,
    string | number | boolean | null
  >;
}

/** Optional free text that clears to null when blank. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

/** Search term safe to embed in PostgREST filters (letters, digits, space, - _ .). */
export const searchTermSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}\p{N} ._-]+$/u, "Search may contain only letters, numbers, spaces, '.', '_' and '-'.");

// --- attendance ------------------------------------------------------------------

/** Attendance statuses exactly as defined by the database enum. */
export const attendanceStatusSchema = z.enum(Constants.public.Enums.attendanceStatus);

/**
 * Latest acceptable attendance date: today (UTC) plus one day, absorbing time
 * zones ahead of UTC. Mirrors the database rule "attendanceDateNotFuture".
 */
export function latestAttendanceDate(now = new Date()): string {
  const latest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return latest.toISOString().slice(0, 10);
}

export const attendanceDateSchema = z.iso
  .date()
  .refine((value) => value <= latestAttendanceDate(), "Attendance cannot be recorded for a future date.");

/** Optional date filters: an exact `date`, or a `from`/`to` range (not both). */
export const dateFilterShape = {
  date: z.iso.date().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

export function refineDateFilters<T extends { date?: string; from?: string; to?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.date && (value.from || value.to)) {
    ctx.addIssue({ code: "custom", path: ["date"], message: "Use either date or from/to, not both." });
  }
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "to must not be before from." });
  }
}
