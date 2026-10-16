import { z } from 'zod';
import { TEACHER_ATTENDANCE_COLUMNS, TEACHER_ATTENDANCE_ERRORS } from '@/constants/teacher-attendance';
import { findTeacherIdByUserId, requireAdmin, requireRole } from '@/functions/authorization';
import { requireActiveTeacher } from '@/functions/teachers';
import { forbidden } from '@/helpers/api-error';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { attendanceDateSchema, attendanceStatusSchema, dateFilterShape, optionalText, refineDateFilters } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { TeacherAttendance } from '@/types/teacher-attendance';

/**
 * TEACHER ATTENDANCE — ONE RECORD PER TEACHER PER DAY.
 * - ADMINS: RECORD, CORRECT AND READ ANYONE'S. TEACHERS: READ THEIR OWN ONLY —
 *   THEY CANNOT RECORD OR CORRECT ANY (INCLUDING THEIR OWN). STUDENTS: NO ACCESS.
 * - THE TEACHER MUST BE ACTIVE; THE DATE MAY NOT BE IN THE FUTURE; ONE RECORD
 *   PER TEACHER PER DATE (409); `markedByUserId` IS THE ACTING ADMIN.
 */

const createTeacherAttendanceSchema = z.strictObject({
  teacherId: uuidSchema,
  attendanceDate: attendanceDateSchema,
  status: attendanceStatusSchema,
  remarks: optionalText(500),
});
const listTeacherAttendanceQuerySchema = z
  .object({ teacherId: uuidSchema.optional(), status: attendanceStatusSchema.optional(), ...dateFilterShape })
  .superRefine(refineDateFilters);

/** ADMINS: ALL. TEACHERS: THEIR OWN (ANOTHER teacherId → 403). STUDENTS: 403. ?teacherId= ?STATUS= ?DATE= | ?FROM=&TO= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listTeacherAttendanceQuerySchema);
  const pagination = getPagination(searchParams);
  // RLS LIMITS A TEACHER TO THEIR OWN ROWS; ASKING FOR ANOTHER TEACHER IS AN EXPLICIT 403.
  if (viewer.role === 'TEACHER' && filters.teacherId) {
    if (unwrapResult(await findTeacherIdByUserId(supabase, viewer.id)) !== filters.teacherId) {
      throw forbidden('Teachers can only view their own attendance.');
    }
  }

  let query = supabase.from('teacherAttendance').select(TEACHER_ATTENDANCE_COLUMNS, { count: 'exact' });
  if (filters.teacherId) query = query.eq('teacherId', filters.teacherId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.date) query = query.eq('attendanceDate', filters.date);
  if (filters.from) query = query.gte('attendanceDate', filters.from);
  if (filters.to) query = query.lte('attendanceDate', filters.to);
  const rows = query.order('attendanceDate', { ascending: false }).order('teacherId').order('id').range(pagination.from, pagination.to);
  return paginated(await page<TeacherAttendance>('teacherAttendance.list', rows, pagination, TEACHER_ATTENDANCE_ERRORS));
});

/** ADMIN ONLY. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const record = await parseJsonBody(request, createTeacherAttendanceSchema);
  unwrapResult(await requireActiveTeacher(supabase, record.teacherId));
  const query = supabase.from('teacherAttendance').insert({ ...record, markedByUserId: actor.id }).select(TEACHER_ATTENDANCE_COLUMNS);
  const [saved] = await many<TeacherAttendance>('teacherAttendance.insert', query, TEACHER_ATTENDANCE_ERRORS);
  return created(saved);
});
