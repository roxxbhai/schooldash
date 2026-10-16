import { z } from 'zod';
import { ACADEMIC_YEAR_COLUMNS, ACADEMIC_YEAR_ERRORS } from '@/constants/academic-years';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { AcademicYear } from '@/types/academic-years';

/**
 * ACADEMIC YEARS. READ: ANY ACTIVE USER. WRITE: ADMINS (ROUTE GUARD AND RLS).
 * YEARS ARE NEVER DELETED — CLASSES, ENROLLMENTS AND EXAMS REFERENCE THEM —
 * AND "CURRENT" IS SWITCHED ONLY THROUGH /{ID}/set-current.
 */

const createAcademicYearSchema = z
  .strictObject({ name: z.string().trim().min(1).max(50), startDate: z.iso.date(), endDate: z.iso.date() })
  .refine((year) => year.endDate > year.startDate, { path: ['endDate'], message: 'endDate must be after startDate.' });

/** ANY ACTIVE USER. NEWEST FIRST. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const pagination = getPagination(new URL(request.url).searchParams);
  const query = supabase
    .from('academicYears')
    .select(ACADEMIC_YEAR_COLUMNS, { count: 'exact' })
    .order('startDate', { ascending: false })
    .order('id') // UNIQUE TIEBREAKER: STABLE PAGES
    .range(pagination.from, pagination.to);
  return paginated(await page<AcademicYear>('academicYears.list', query, pagination, ACADEMIC_YEAR_ERRORS));
});

/** ADMIN ONLY. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const newYear = await parseJsonBody(request, createAcademicYearSchema);
  const query = supabase.from('academicYears').insert(newYear).select(ACADEMIC_YEAR_COLUMNS).maybeSingle();
  return created(await one<AcademicYear>('academicYears.insert', query, ACADEMIC_YEAR_ERRORS));
});
