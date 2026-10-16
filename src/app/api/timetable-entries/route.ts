import { z } from 'zod';
import { DAY_OF_WEEK_SCHEMA, TIME_SCHEMA, TIMETABLE_COLUMNS, TIMETABLE_ERRORS } from '@/constants/timetable';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { findSubject } from '@/functions/subjects';
import { validateStaffing } from '@/functions/timetable';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { optionalText, unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { TablesInsert } from '@/types/database';
import type { TimetableEntry } from '@/types/timetable';

/**
 * TIMETABLE: WEEKLY RECURRING PERIODS FOR A CLASS.
 * - READ: RLS-SCOPED (ADMINS ALL; TEACHERS THEIR OWN PERIODS AND CLASSES THEY
 *   TEACH; STUDENTS THEIR CLASSES). WRITE: ADMINS ONLY — TEACHERS CANNOT CHANGE
 *   ANY TIMETABLE, INCLUDING THEIR OWN.
 * - THE ACADEMIC YEAR IS COPIED FROM THE CLASS BY THE DATABASE.
 * - CONFLICTS ARE DATABASE EXCLUSION CONSTRAINTS, SO CONCURRENT REQUESTS CANNOT
 *   BOTH SUCCEED: NO OVERLAPPING PERIODS FOR A CLASS ON A DAY, OR FOR A TEACHER
 *   ON A DAY IN ONE ACADEMIC YEAR. PERIODS ARE HALF-OPEN, SO BACK-TO-BACK
 *   PERIODS DON'T CONFLICT. → 409.
 */

const createTimetableEntrySchema = z
  .strictObject({
    classId: uuidSchema,
    subjectId: uuidSchema,
    teacherId: uuidSchema.nullable().optional(),
    dayOfWeek: DAY_OF_WEEK_SCHEMA,
    startTime: TIME_SCHEMA,
    endTime: TIME_SCHEMA,
    room: optionalText(50),
  })
  .refine((period) => period.endTime > period.startTime, { path: ['endTime'], message: 'endTime must be after startTime.' });
const listTimetableQuerySchema = z.object({
  academicYearId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  teacherId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  dayOfWeek: z.coerce.number().pipe(DAY_OF_WEEK_SCHEMA).optional(),
});

/** RLS-SCOPED. ?academicYearId= ?classId= ?teacherId= ?subjectId= ?dayOfWeek= — ORDERED BY DAY, THEN START TIME. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listTimetableQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('timetableEntries').select(TIMETABLE_COLUMNS, { count: 'exact' });
  if (filters.academicYearId) query = query.eq('academicYearId', filters.academicYearId);
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.teacherId) query = query.eq('teacherId', filters.teacherId);
  if (filters.subjectId) query = query.eq('subjectId', filters.subjectId);
  if (filters.dayOfWeek) query = query.eq('dayOfWeek', filters.dayOfWeek);
  const rows = query.order('dayOfWeek').order('startTime').order('classId').order('id').range(pagination.from, pagination.to);
  return paginated(await page<TimetableEntry>('timetableEntries.list', rows, pagination, TIMETABLE_ERRORS));
});

/** ADMIN ONLY. { classId, subjectId, teacherId?, dayOfWeek, startTime, endTime, ROOM? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const period = await parseJsonBody(request, createTimetableEntrySchema);
  unwrapReference(await findClass(supabase, period.classId), 'classId', 'Class not found.');
  unwrapReference(await findSubject(supabase, period.subjectId), 'subjectId', 'Subject not found.');
  const teacherId = period.teacherId ?? null;
  unwrapResult(await validateStaffing(supabase, { classId: period.classId, subjectId: period.subjectId, teacherId }));

  // academicYearId IS SET BY THE DATABASE FROM THE CLASS, SO IT IS NOT PART OF THE INSERT.
  const newEntry = { ...period, teacherId } as TablesInsert<'timetableEntries'>;
  const query = supabase.from('timetableEntries').insert(newEntry).select(TIMETABLE_COLUMNS).maybeSingle();
  return created(await one<TimetableEntry>('timetableEntries.insert', query, TIMETABLE_ERRORS));
});
