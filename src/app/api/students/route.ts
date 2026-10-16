import { z } from 'zod';
import { ADMISSION_NUMBER_SCHEMA, STUDENT_COLUMNS, STUDENT_COLUMNS_FILTERABLE, STUDENT_ERRORS } from '@/constants/students';
import { requireAdmin, requireRole } from '@/functions/authorization';
import { provisionAccount } from '@/functions/provisioning';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { emailSchema, fullNameSchema, initialPasswordSchema, isActiveFilterSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Student } from '@/types/students';

/**
 * STUDENTS. ACCOUNTS ARE CREATED ONLY BY ADMINS, THROUGH PROVISIONING, WITH THE
 * ROLE FIXED TO STUDENT; A CLIENT CAN NEVER CHOOSE A ROLE, STATUS OR USER ID.
 */

const createStudentSchema = z.strictObject({
  email: emailSchema,
  fullName: fullNameSchema,
  password: initialPasswordSchema,
  admissionNumber: ADMISSION_NUMBER_SCHEMA,
  admissionDate: z.iso.date().optional(),
  dateOfBirth: z.iso.date().optional(),
  gender: z.string().trim().min(1).max(30).optional(),
  bloodGroup: z.string().trim().min(1).max(10).optional(),
  fatherName: z.string().trim().min(1).max(200).optional(),
  motherName: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().min(1).max(500).optional(),
});
const listStudentsQuerySchema = z.object({ isActive: isActiveFilterSchema, classId: uuidSchema.optional() });

/** ADMINS: ALL STUDENTS. TEACHERS: STUDENTS THEY TEACH (RLS). ?classId= ?isActive= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const searchParams = new URL(request.url).searchParams;
  const { isActive, classId } = parseQuery(searchParams, listStudentsQuerySchema);
  const pagination = getPagination(searchParams);

  const isActiveFiltered = isActive !== undefined;
  const columns = [
    isActiveFiltered ? STUDENT_COLUMNS_FILTERABLE : STUDENT_COLUMNS,
    // EMPTY EMBED: FILTERS BY ENROLLMENT WITHOUT ADDING FIELDS TO THE RESPONSE.
    ...(classId ? ['enrollment:studentEnrollments!inner()'] : []),
  ].join(', ');
  let query = supabase.from('students').select(columns, { count: 'exact' });
  if (isActiveFiltered) query = query.eq('user.isActive', isActive);
  if (classId) query = query.eq('enrollment.classId', classId);
  const rows = query.order('admissionNumber').range(pagination.from, pagination.to).overrideTypes<Student[], { merge: false }>();
  return paginated(await page<Student>('students.list', rows, pagination, STUDENT_ERRORS));
});

/** ADMIN ONLY. CREATES THE LOGIN IDENTITY AND THE STUDENT ACCOUNT; THE ADMIN IS RECORDED AS THE ACTOR. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { email, fullName, password, ...profile } = await parseJsonBody(request, createStudentSchema);
  const account = unwrapResult(
    await provisionAccount({ role: 'STUDENT', email, fullName, password, profile }, { actorUserId: actor.id }),
  );
  const query = supabase
    .from('students')
    .select(STUDENT_COLUMNS)
    .eq('userId', account.userId)
    .maybeSingle()
    .overrideTypes<Student, { merge: false }>();
  return created(await one<Student>('students.getByUser', query, STUDENT_ERRORS));
});
