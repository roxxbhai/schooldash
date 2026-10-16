import { z } from 'zod';
import { ACADEMIC_YEAR_COLUMNS, ACADEMIC_YEAR_ERRORS } from '@/constants/academic-years';
import { findAcademicYear } from '@/functions/academic-years';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { AcademicYear } from '@/types/academic-years';

type Context = RouteContext<'/api/academic-years/[id]'>;

const updateAcademicYearSchema = z
  .strictObject({ name: z.string().trim().min(1).max(50).optional(), startDate: z.iso.date().optional(), endDate: z.iso.date().optional() })
  .refine((year) => !year.startDate || !year.endDate || year.endDate > year.startDate, {
    path: ['endDate'],
    message: 'endDate must be after startDate.',
  });

/** ANY ACTIVE USER. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findAcademicYear(supabase, id)));
});

/** ADMIN ONLY. NAME, startDate, endDate (THE DATABASE ALSO CHECKS THE RESULTING RANGE). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateAcademicYearSchema));
  const query = supabase.from('academicYears').update(changes).eq('id', id).select(ACADEMIC_YEAR_COLUMNS).maybeSingle();
  return ok(await one<AcademicYear>('academicYears.update', query, ACADEMIC_YEAR_ERRORS));
});
