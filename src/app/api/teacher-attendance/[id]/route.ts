import { z } from 'zod';
import { TEACHER_ATTENDANCE_COLUMNS, TEACHER_ATTENDANCE_ERRORS } from '@/constants/teacher-attendance';
import { requireAdmin, requireRole } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { attendanceStatusSchema, optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { DbClient } from '@/types/supabase';
import type { TeacherAttendance } from '@/types/teacher-attendance';

type Context = RouteContext<'/api/teacher-attendance/[id]'>;

/** ONLY STATUS AND REMARKS CAN BE CORRECTED. */
const updateTeacherAttendanceSchema = z.strictObject({ status: attendanceStatusSchema.optional(), remarks: optionalText(500) });

function findAttendanceRecord(supabase: DbClient, id: string) {
  const query = supabase.from('teacherAttendance').select(TEACHER_ATTENDANCE_COLUMNS).eq('id', id).maybeSingle();
  return one<TeacherAttendance>('teacherAttendance.get', query, TEACHER_ATTENDANCE_ERRORS);
}

/** ADMINS: ANY. TEACHERS: THEIR OWN (OTHERS → 404 VIA RLS). STUDENTS: 403. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await findAttendanceRecord(supabase, id));
});

/** ADMIN ONLY. CORRECTS status/remarks AND RECORDS THE EDITOR (AUDITED). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateTeacherAttendanceSchema));
  await findAttendanceRecord(supabase, id); // 404 IF IT DOESN'T EXIST
  const query = supabase
    .from('teacherAttendance')
    .update({ ...changes, markedByUserId: actor.id })
    .eq('id', id)
    .select(TEACHER_ATTENDANCE_COLUMNS)
    .maybeSingle();
  return ok(await one<TeacherAttendance>('teacherAttendance.update', query, TEACHER_ATTENDANCE_ERRORS));
});
