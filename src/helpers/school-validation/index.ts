import 'server-only';
import { z } from 'zod';
import { ApiError, validationError } from '@/helpers/api-error';
import { unwrapResult } from '@/helpers/function-result';
import { Constants } from '@/types/database';
import type { FunctionResult } from '@/types/function-result';

/** SHARED VALIDATION PIECES FOR THE SCHOOL-MANAGEMENT APIs. */

/** RESOLVES A REFERENCED RECORD OR REPORTS IT AS A 422 ON `field`. */
export async function referenced<T>(lookup: Promise<T>, field: string, message: string): Promise<T> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw validationError([{ path: field, message }]);
    throw error;
  }
}

/**
 * THE DATA OF A LOOKUP RESULT FOR A RECORD THE REQUEST BODY REFERENCES. A
 * MISSING (404) RECORD BECOMES A 422 ON `field`; ANY OTHER FAILURE IS RETHROWN.
 */
export function unwrapReference<T>(result: FunctionResult<T>, field: string, message: string): T {
  if (!result.success && result.data.status === 404) throw validationError([{ path: field, message }]);
  return unwrapResult(result);
}

/** REJECTS AN UPDATE WITH NO FIELDS (422) AND STRIPS UNDEFINED KEYS. */
export function requireChanges<T extends Record<string, unknown>>(input: T): Partial<T> {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw validationError([{ path: '', message: 'Provide at least one field to update.' }]);
  }
  return Object.fromEntries(entries) as Partial<T>;
}

/** COPIES AN OBJECT WITHOUT ITS UNDEFINED KEYS (FOR JSONB PATCH ARGUMENTS). */
export function definedOnly(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<
    string,
    string | number | boolean | null
  >;
}

/** OPTIONAL FREE TEXT THAT CLEARS TO NULL WHEN BLANK. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

/** A PERSON'S FULL NAME (TEACHERS, STUDENTS). */
export const fullNameSchema = z.string().trim().min(1).max(200);

/** A NEW ACCOUNT'S LOGIN EMAIL, STORED LOWER-CASE. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** `?isActive=true|false` ON PEOPLE LISTS. */
export const isActiveFilterSchema = z.enum(['true', 'false']).transform((value) => value === 'true').optional();

/** SEARCH TERM SAFE TO EMBED IN PostgREST FILTERS (LETTERS, DIGITS, SPACE, - _ .). */
export const searchTermSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  // \p{M}: COMBINING MARKS, SO DEVANAGARI NAMES (VOWEL SIGNS SUCH AS ा AND ु) CAN BE SEARCHED.
  .regex(/^[\p{L}\p{M}\p{N} ._-]+$/u, "Search may contain only letters, numbers, spaces, '.', '_' and '-'.");

// --- ATTENDANCE ------------------------------------------------------------------

/** ATTENDANCE STATUSES EXACTLY AS DEFINED BY THE DATABASE ENUM. */
export const attendanceStatusSchema = z.enum(Constants.public.Enums.attendanceStatus);

/**
 * LATEST ACCEPTABLE ATTENDANCE DATE: TODAY (UTC) PLUS ONE DAY, ABSORBING TIME
 * ZONES AHEAD OF UTC. MIRRORS THE DATABASE RULE "attendanceDateNotFuture".
 */
export function latestAttendanceDate(now = new Date()): string {
  const latest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return latest.toISOString().slice(0, 10);
}

export const attendanceDateSchema = z.iso
  .date()
  .refine((value) => value <= latestAttendanceDate(), 'Attendance cannot be recorded for a future date.');

/** OPTIONAL DATE FILTERS: AN EXACT `date`, OR A `from`/`to` RANGE (NOT BOTH). */
export const dateFilterShape = {
  date: z.iso.date().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

export function refineDateFilters<T extends { date?: string; from?: string; to?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.date && (value.from || value.to)) {
    ctx.addIssue({ code: 'custom', path: ['date'], message: 'Use either date or from/to, not both.' });
  }
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not be before from.' });
  }
}

// --- MARKS -------------------------------------------------------------------------

/**
 * MARKS AS STORED IN NUMERIC(6,2): 0 – 9999.99 WITH AT MOST TWO DECIMALS.
 * MORE DECIMALS ARE REJECTED (POSTGRES WOULD OTHERWISE ROUND THEM SILENTLY).
 */
export const marksSchema = z
  .number()
  .min(0)
  .max(9999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'At most two decimal places.');

/** CONVERTS MARKS TO INTEGER HUNDREDTHS SO TOTALS ARE EXACT (NO FLOATING-POINT DRIFT). */
export function toHundredths(marks: number): number {
  return Math.round(marks * 100);
}

export function fromHundredths(hundredths: number): number {
  return hundredths / 100;
}
