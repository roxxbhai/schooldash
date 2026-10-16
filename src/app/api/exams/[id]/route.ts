import { z } from 'zod';
import { EXAM_COLUMNS, EXAM_ERRORS, EXAM_NAME_SCHEMA } from '@/constants/exams';
import { findAcademicYear } from '@/functions/academic-years';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findExam } from '@/functions/exams';
import { validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { examDatesIssue } from '@/helpers/exams';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Exam } from '@/types/exams';

type Context = RouteContext<'/api/exams/[id]'>;

/** academicYearId IS DELIBERATELY ABSENT: AN EXAM NEVER MOVES TO ANOTHER YEAR. */
const updateExamSchema = z.strictObject({
  name: EXAM_NAME_SCHEMA.optional(),
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
});

/** ANY ACTIVE USER. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findExam(supabase, id)));
});

/** ADMIN ONLY. NAME, startDate, endDate — VALIDATED AS THE RESULTING PAIR OF DATES. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateExamSchema));
  const current = unwrapResult(await findExam(supabase, id));
  const year = unwrapResult(await findAcademicYear(supabase, current.academicYearId));
  const datesIssue = examDatesIssue(
    {
      startDate: 'startDate' in changes ? changes.startDate : current.startDate,
      endDate: 'endDate' in changes ? changes.endDate : current.endDate,
    },
    year,
  );
  if (datesIssue) throw validationError([datesIssue]);

  const query = supabase.from('exams').update(changes).eq('id', id).select(EXAM_COLUMNS).maybeSingle();
  return ok(await one<Exam>('exams.update', query, EXAM_ERRORS));
});
