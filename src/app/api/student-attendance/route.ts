import { z } from 'zod';
import { STUDENT_ATTENDANCE_COLUMNS, STUDENT_ATTENDANCE_ERRORS } from '@/constants/student-attendance';
import { requireAuthenticatedUser, requireRole, requireStudentOwnership } from '@/functions/authorization';
import { requireClassAttendanceWriter, validateAttendanceRecords } from '@/functions/student-attendance';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { attendanceDateSchema, attendanceStatusSchema, dateFilterShape, optionalText, refineDateFilters } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { StudentAttendance } from '@/types/student-attendance';

/**
 * STUDENT ATTENDANCE — ONE RECORD PER STUDENT PER DAY.
 * - ADMINS: RECORD, CORRECT AND READ ANY CLASS. TEACHERS: ONLY CLASSES THEY TEACH
 *   (ANY SUBJECT IN THE CLASS, OR CLASS TEACHER). STUDENTS: READ THEIR OWN ONLY.
 * - THE STUDENT MUST BE ACTIVE AND ENROLLED; THE DATE MUST BE IN THE CLASS'S
 *   ACADEMIC YEAR AND NOT IN THE FUTURE; ONE RECORD PER STUDENT PER DATE (409).
 * - `markedByUserId` IS ALWAYS THE ACTING USER, NEVER REQUEST DATA.
 */

const createStudentAttendanceSchema = z.strictObject({
  studentId: uuidSchema,
  classId: uuidSchema,
  attendanceDate: attendanceDateSchema,
  status: attendanceStatusSchema,
  remarks: optionalText(500),
});
const listStudentAttendanceQuerySchema = z
  .object({ classId: uuidSchema.optional(), studentId: uuidSchema.optional(), status: attendanceStatusSchema.optional(), ...dateFilterShape })
  .superRefine(refineDateFilters);

/** ADMINS: ALL. TEACHERS: CLASSES THEY TEACH. STUDENTS: THEIR OWN (ANOTHER studentId → 403). ?classId= ?studentId= ?STATUS= ?DATE= | ?FROM=&TO= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listStudentAttendanceQuerySchema);
  const pagination = getPagination(searchParams);
  // RLS ALREADY LIMITS A STUDENT TO THEIR OWN RECORDS; ASKING FOR SOMEONE ELSE IS AN EXPLICIT 403.
  if (viewer.role === 'STUDENT' && filters.studentId) unwrapResult(await requireStudentOwnership(supabase, filters.studentId));

  let query = supabase.from('studentAttendance').select(STUDENT_ATTENDANCE_COLUMNS, { count: 'exact' });
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.studentId) query = query.eq('studentId', filters.studentId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.date) query = query.eq('attendanceDate', filters.date);
  if (filters.from) query = query.gte('attendanceDate', filters.from);
  if (filters.to) query = query.lte('attendanceDate', filters.to);
  const rows = query.order('attendanceDate', { ascending: false }).order('studentId').order('id').range(pagination.from, pagination.to);
  return paginated(await page<StudentAttendance>('studentAttendance.list', rows, pagination, STUDENT_ATTENDANCE_ERRORS));
});

/** ADMINS, OR TEACHERS OF THE CLASS. RECORDS ONE STUDENT'S ATTENDANCE FOR ONE DAY. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const record = await parseJsonBody(request, createStudentAttendanceSchema);
  unwrapResult(await requireClassAttendanceWriter(supabase, actor, record.classId));
  unwrapResult(await validateAttendanceRecords(supabase, record.classId, record.attendanceDate, [record.studentId], ['studentId']));

  const query = supabase.from('studentAttendance').insert([{ ...record, markedByUserId: actor.id }]).select(STUDENT_ATTENDANCE_COLUMNS);
  const [saved] = await many<StudentAttendance>('studentAttendance.insert', query, STUDENT_ATTENDANCE_ERRORS);
  return created(saved);
});
