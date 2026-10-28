import { z } from 'zod';
import { ENROLLMENT_COLUMNS, ENROLLMENT_ERRORS, ROLL_NUMBER_SCHEMA } from '@/constants/enrollments';
import { ADMISSION_NUMBER_SCHEMA, STUDENT_COLUMNS, STUDENT_COLUMNS_FILTERABLE, STUDENT_ERRORS } from '@/constants/students';
import { requireAdmin, requireRole } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { provisionAccount } from '@/functions/provisioning';
import { validationError } from '@/helpers/api-error';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many, one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { logServerError } from '@/helpers/logger';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { emailSchema, fullNameSchema, isActiveFilterSchema, searchTermSchema, unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/**
 * STUDENTS. ACCOUNTS ARE CREATED ONLY BY ADMINS, THROUGH PROVISIONING, WITH THE
 * ROLE FIXED TO STUDENT; A CLIENT CAN NEVER CHOOSE A ROLE, STATUS OR USER ID.
 */

const createStudentSchema = z.strictObject({
  // OPTIONAL: STUDENTS SIGN IN WITH THEIR ADMISSION NUMBER (MIGRATION 19).
  email: emailSchema.optional(),
  fullName: fullNameSchema,
  admissionNumber: ADMISSION_NUMBER_SCHEMA,
  admissionDate: z.iso.date().optional(),
  dateOfBirth: z.iso.date().optional(),
  gender: z.string().trim().min(1).max(30).optional(),
  bloodGroup: z.string().trim().min(1).max(10).optional(),
  fatherName: z.string().trim().min(1).max(200).optional(),
  motherName: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().min(1).max(500).optional(),
  // OPTIONAL: ENROLL THE NEW STUDENT IN THIS CLASS (AND ITS ACADEMIC YEAR) RIGHT AWAY.
  classId: uuidSchema.optional(),
  rollNumber: ROLL_NUMBER_SCHEMA.optional(),
}).refine((input) => input.rollNumber === undefined || input.classId !== undefined, {
  path: ['rollNumber'],
  message: 'A roll number needs a class.',
});
const listStudentsQuerySchema = z.object({ isActive: isActiveFilterSchema, classId: uuidSchema.optional(), search: searchTermSchema.optional() });

/** ADMINS: ALL STUDENTS. TEACHERS: STUDENTS THEY TEACH (RLS). ?classId= ?isActive= ?search= (ADMISSION NUMBER, NAME OR EMAIL) */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const searchParams = new URL(request.url).searchParams;
  const { isActive, classId, search } = parseQuery(searchParams, listStudentsQuerySchema);
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
  // `studentSearchText` IS A COMPUTED FIELD (MIGRATION 13). `search` IS LIMITED TO
  // [LETTERS DIGITS SPACE . _ -] BY searchTermSchema, SO IT CANNOT INJECT FILTER SYNTAX.
  if (search) query = query.ilike('studentSearchText', `%${search}%`);
  const rows = query.order('admissionNumber').range(pagination.from, pagination.to).overrideTypes<Student[], { merge: false }>();
  return paginated(await page<Student>('students.list', rows, pagination, STUDENT_ERRORS));
});

/**
 * ADMIN ONLY. CREATES THE LOGIN IDENTITY AND THE STUDENT ACCOUNT; THE ADMIN IS RECORDED AS THE ACTOR.
 * NO PASSWORD: THE STUDENT SIGNS IN WITH THEIR ADMISSION NUMBER (POST /api/auth/student/login).
 *
 * WITH `classId` THE STUDENT IS ALSO ENROLLED IN THAT CLASS. THE CLASS AND ROLL NUMBER ARE CHECKED
 * FIRST (422), SO A MISTAKE THERE CREATES NOTHING. AUTH AND THE DATABASE CAN'T SHARE A TRANSACTION, SO
 * IF THE ENROLLMENT STILL FAILS AFTERWARDS THE STUDENT IS KEPT AND `enrollment` IS NULL: THE ADMIN CAN
 * ENROLL THEM FROM THE ENROLLMENTS PAGE.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { email, fullName, classId, rollNumber, ...profile } = await parseJsonBody(request, createStudentSchema);

  const schoolClass = classId ? unwrapReference(await findClass(supabase, classId), 'classId', 'Class not found.') : null;
  if (schoolClass && rollNumber !== undefined) {
    const taken = await many<{ id: string }>(
      'enrollments.rollNumberTaken',
      supabase.from('studentEnrollments').select('id').eq('classId', schoolClass.id).eq('rollNumber', rollNumber).limit(1),
      ENROLLMENT_ERRORS,
    );
    if (taken.length > 0) throw validationError([{ path: 'rollNumber', message: 'This roll number is already used in the class.' }]);
  }

  const account = unwrapResult(await provisionAccount({ role: 'STUDENT', email, fullName, profile }, { actorUserId: actor.id }));
  const query = supabase
    .from('students')
    .select(STUDENT_COLUMNS)
    .eq('userId', account.userId)
    .maybeSingle()
    .overrideTypes<Student, { merge: false }>();
  const student = await one<Student>('students.getByUser', query, STUDENT_ERRORS);
  if (!schoolClass) return created({ ...student, enrollment: null });

  const newEnrollment = { studentId: student.id, classId: schoolClass.id, academicYearId: schoolClass.academicYearId, rollNumber };
  const enrollment = await supabase.from('studentEnrollments').insert(newEnrollment).select(ENROLLMENT_COLUMNS).maybeSingle<Enrollment>();
  if (enrollment.error) logServerError('students.enrollOnCreate', enrollment.error, { studentId: student.id });
  return created({ ...student, enrollment: enrollment.data ?? null });
});
