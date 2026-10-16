import { z } from 'zod';
import { DAY_OF_WEEK_SCHEMA, TIME_SCHEMA, TIMETABLE_COLUMNS, TIMETABLE_ERRORS } from '@/constants/timetable';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { findSubject } from '@/functions/subjects';
import { validateStaffing } from '@/functions/timetable';
import { validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams, uuidSchema } from '@/helpers/request-validation';
import { optionalText, requireChanges, unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { DbClient } from '@/types/supabase';
import type { TimetableEntry } from '@/types/timetable';

type Context = RouteContext<'/api/timetable-entries/[id]'>;

const updateTimetableEntrySchema = z.strictObject({
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  teacherId: uuidSchema.nullable().optional(),
  dayOfWeek: DAY_OF_WEEK_SCHEMA.optional(),
  startTime: TIME_SCHEMA.optional(),
  endTime: TIME_SCHEMA.optional(),
  room: optionalText(50),
});

function findTimetableEntry(supabase: DbClient, id: string) {
  const query = supabase.from('timetableEntries').select(TIMETABLE_COLUMNS).eq('id', id).maybeSingle();
  return one<TimetableEntry>('timetableEntries.get', query, TIMETABLE_ERRORS);
}

/** RLS-SCOPED; OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await findTimetableEntry(supabase, id));
});

/**
 * ADMIN ONLY. ANY OF THE CREATE FIELDS, VALIDATED AGAINST THE COMPLETE RESULTING
 * ENTRY (TIMES IN ORDER; THE TEACHER STILL ASSIGNED TO THE CLASS AND SUBJECT).
 * AN ENTRY NEVER CONFLICTS WITH ITSELF.
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateTimetableEntrySchema));
  const current = await findTimetableEntry(supabase, id);
  const resulting = {
    classId: changes.classId ?? current.classId,
    subjectId: changes.subjectId ?? current.subjectId,
    teacherId: 'teacherId' in changes ? (changes.teacherId ?? null) : current.teacherId,
    startTime: changes.startTime ?? current.startTime,
    endTime: changes.endTime ?? current.endTime,
  };

  if (resulting.endTime <= resulting.startTime) {
    throw validationError([{ path: changes.endTime ? 'endTime' : 'startTime', message: 'endTime must be after startTime.' }]);
  }
  if (changes.classId && changes.classId !== current.classId) {
    unwrapReference(await findClass(supabase, changes.classId), 'classId', 'Class not found.');
  }
  if (changes.subjectId && changes.subjectId !== current.subjectId) {
    unwrapReference(await findSubject(supabase, changes.subjectId), 'subjectId', 'Subject not found.');
  }
  const isStaffingChanged =
    resulting.classId !== current.classId || resulting.subjectId !== current.subjectId || resulting.teacherId !== current.teacherId;
  if (isStaffingChanged) unwrapResult(await validateStaffing(supabase, resulting));

  const query = supabase.from('timetableEntries').update(changes).eq('id', id).select(TIMETABLE_COLUMNS).maybeSingle();
  return ok(await one<TimetableEntry>('timetableEntries.update', query, TIMETABLE_ERRORS));
});

/** ADMIN ONLY. ENTRIES ARE CONFIGURATION, NOT HISTORY (THE DELETION IS AUDITED). RETURNS THE REMOVED ENTRY. */
export const DELETE = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const query = supabase.from('timetableEntries').delete().eq('id', id).select(TIMETABLE_COLUMNS).maybeSingle();
  return ok(await one<TimetableEntry>('timetableEntries.delete', query, TIMETABLE_ERRORS));
});
