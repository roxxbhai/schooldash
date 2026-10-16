import { z } from 'zod';
import { STUDENT_ATTENDANCE_COLUMNS, STUDENT_ATTENDANCE_ERRORS } from '@/constants/student-attendance';
import { requireAuthenticatedUser, requireRole } from '@/functions/authorization';
import { requireClassAttendanceWriter } from '@/functions/student-attendance';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { attendanceStatusSchema, optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { DbClient } from '@/types/supabase';
import type { StudentAttendance } from '@/types/student-attendance';

type Context = RouteContext<'/api/student-attendance/[id]'>;

/** ONLY STATUS AND REMARKS CAN BE CORRECTED; WHO, WHICH CLASS AND WHICH DAY ARE FIXED. */
const updateStudentAttendanceSchema = z.strictObject({ status: attendanceStatusSchema.optional(), remarks: optionalText(500) });

function findAttendanceRecord(supabase: DbClient, id: string) {
  const query = supabase.from('studentAttendance').select(STUDENT_ATTENDANCE_COLUMNS).eq('id', id).maybeSingle();
  return one<StudentAttendance>('studentAttendance.get', query, STUDENT_ATTENDANCE_ERRORS);
}

/** VISIBLE PER RLS (ADMIN / TEACHER OF THE CLASS / THE STUDENT); OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await findAttendanceRecord(supabase, id));
});

/** ADMINS, OR TEACHERS OF THE RECORD'S CLASS. CORRECTS status/remarks AND RECORDS THE EDITOR (AUDITED). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateStudentAttendanceSchema));
  const existing = await findAttendanceRecord(supabase, id); // 404 IF NOT VISIBLE
  unwrapResult(await requireClassAttendanceWriter(supabase, actor, existing.classId));

  const query = supabase
    .from('studentAttendance')
    .update({ ...changes, markedByUserId: actor.id })
    .eq('id', id)
    .select(STUDENT_ATTENDANCE_COLUMNS)
    .maybeSingle();
  return ok(await one<StudentAttendance>('studentAttendance.update', query, STUDENT_ATTENDANCE_ERRORS));
});
