import { z } from 'zod';
import { EXAM_COLUMNS, EXAM_ERRORS, EXAM_NAME_SCHEMA } from '@/constants/exams';
import { findAcademicYear } from '@/functions/academic-years';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { validationError } from '@/helpers/api-error';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { examDatesIssue } from '@/helpers/exams';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Exam } from '@/types/exams';

/**
 * EXAMS: AN EXAMINATION EVENT WITHIN ONE ACADEMIC YEAR (E.G. "TERM 1").
 * READ: ANY ACTIVE USER. WRITE: ADMINS. THE ACADEMIC YEAR IS FIXED AT CREATION;
 * OPTIONAL DATES MUST BE IN ORDER AND INSIDE THE YEAR; NAMES ARE UNIQUE PER YEAR
 * (409). EXAMS ARE NEVER DELETED — PAPERS AND RESULTS REFERENCE THEM.
 */

const createExamSchema = z
  .strictObject({ academicYearId: uuidSchema, name: EXAM_NAME_SCHEMA, startDate: z.iso.date().optional(), endDate: z.iso.date().optional() })
  .refine((exam) => !exam.startDate || !exam.endDate || exam.endDate >= exam.startDate, {
    path: ['endDate'],
    message: 'endDate must not be before startDate.',
  });
const listExamsQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

/** ANY ACTIVE USER. ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const { academicYearId } = parseQuery(searchParams, listExamsQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('exams').select(EXAM_COLUMNS, { count: 'exact' });
  if (academicYearId) query = query.eq('academicYearId', academicYearId);
  const rows = query
    .order('startDate', { ascending: false, nullsFirst: false })
    .order('name')
    .order('id')
    .range(pagination.from, pagination.to);
  return paginated(await page<Exam>('exams.list', rows, pagination, EXAM_ERRORS));
});

/** ADMIN ONLY. { academicYearId, NAME, startDate?, endDate? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const newExam = await parseJsonBody(request, createExamSchema);
  const year = unwrapReference(await findAcademicYear(supabase, newExam.academicYearId), 'academicYearId', 'Academic year not found.');
  const datesIssue = examDatesIssue(newExam, year);
  if (datesIssue) throw validationError([datesIssue]);

  const query = supabase.from('exams').insert(newExam).select(EXAM_COLUMNS).maybeSingle();
  return created(await one<Exam>('exams.insert', query, EXAM_ERRORS));
});
