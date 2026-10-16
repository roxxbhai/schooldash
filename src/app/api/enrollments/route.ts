import { z } from 'zod';
import { ENROLLMENT_COLUMNS, ENROLLMENT_ERRORS, ROLL_NUMBER_SCHEMA } from '@/constants/enrollments';
import { requireAdmin, requireAuthenticatedUser, requireStudentOwnership } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { requireActiveStudent } from '@/functions/students';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Enrollment } from '@/types/enrollments';

/**
 * ENROLLMENTS: A STUDENT IN ONE CLASS PER ACADEMIC YEAR. THE YEAR ALWAYS COMES
 * FROM THE CLASS. HISTORY IS KEPT — ENROLLMENTS ARE NEVER DELETED.
 */

const createEnrollmentSchema = z.strictObject({ studentId: uuidSchema, classId: uuidSchema, rollNumber: ROLL_NUMBER_SCHEMA.optional() });
const listEnrollmentsQuerySchema = z.object({
  studentId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  academicYearId: uuidSchema.optional(),
});

/** ADMINS: ALL. TEACHERS: CLASSES THEY TEACH. STUDENTS: THEIR OWN. ?studentId= ?classId= ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listEnrollmentsQuerySchema);
  const pagination = getPagination(searchParams);
  // RLS ALREADY LIMITS A STUDENT TO THEIR OWN ROWS; ASKING FOR SOMEONE ELSE IS AN EXPLICIT 403.
  if (viewer.role === 'STUDENT' && filters.studentId) unwrapResult(await requireStudentOwnership(supabase, filters.studentId));

  let query = supabase.from('studentEnrollments').select(ENROLLMENT_COLUMNS, { count: 'exact' });
  if (filters.studentId) query = query.eq('studentId', filters.studentId);
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.academicYearId) query = query.eq('academicYearId', filters.academicYearId);
  const rows = query.order('enrolledOn', { ascending: false }).order('rollNumber').order('id').range(pagination.from, pagination.to);
  return paginated(await page<Enrollment>('enrollments.list', rows, pagination, ENROLLMENT_ERRORS));
});

/** ADMIN ONLY. THE STUDENT MUST BE ACTIVE; THE ACADEMIC YEAR COMES FROM THE CLASS, NEVER FROM THE REQUEST. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const input = await parseJsonBody(request, createEnrollmentSchema);
  unwrapResult(await requireActiveStudent(supabase, input.studentId));
  const schoolClass = unwrapReference(await findClass(supabase, input.classId), 'classId', 'Class not found.');

  const newEnrollment = {
    studentId: input.studentId,
    classId: schoolClass.id,
    academicYearId: schoolClass.academicYearId,
    rollNumber: input.rollNumber,
  };
  const query = supabase.from('studentEnrollments').insert(newEnrollment).select(ENROLLMENT_COLUMNS).maybeSingle();
  return created(await one<Enrollment>('enrollments.insert', query, ENROLLMENT_ERRORS));
});
