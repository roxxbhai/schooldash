import { z } from 'zod';
import { EMPLOYEE_CODE_SCHEMA, TEACHER_COLUMNS, TEACHER_COLUMNS_FILTERABLE, TEACHER_ERRORS } from '@/constants/teachers';
import { issueSetupCode } from '@/functions/account-setup';
import { requireAdmin } from '@/functions/authorization';
import { provisionAccount } from '@/functions/provisioning';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery } from '@/helpers/request-validation';
import { emailSchema, fullNameSchema, initialPasswordSchema, isActiveFilterSchema, searchTermSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Teacher } from '@/types/teachers';

/**
 * TEACHERS. ACCOUNTS ARE CREATED ONLY BY ADMINS, THROUGH PROVISIONING, WITH THE
 * ROLE FIXED TO TEACHER; A CLIENT CAN NEVER CHOOSE A ROLE, STATUS OR USER ID.
 */

const createTeacherSchema = z.strictObject({
  email: emailSchema,
  fullName: fullNameSchema,
  password: initialPasswordSchema,
  employeeCode: EMPLOYEE_CODE_SCHEMA,
  qualification: z.string().trim().min(1).max(200).optional(),
  dateOfJoining: z.iso.date().optional(),
});
const listTeachersQuerySchema = z.object({ isActive: isActiveFilterSchema, search: searchTermSchema.optional() });

/** ADMIN ONLY. ?isActive=TRUE|FALSE ?search= MATCHES EMPLOYEE CODE, NAME OR EMAIL. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const searchParams = new URL(request.url).searchParams;
  const { isActive, search } = parseQuery(searchParams, listTeachersQuerySchema);
  const pagination = getPagination(searchParams);

  const isFiltered = isActive !== undefined;
  let query = supabase.from('teachers').select(isFiltered ? TEACHER_COLUMNS_FILTERABLE : TEACHER_COLUMNS, { count: 'exact' });
  if (isFiltered) query = query.eq('user.isActive', isActive);
  // `teacherSearchText` IS A COMPUTED FIELD (MIGRATION 13). `search` IS LIMITED TO
  // [LETTERS DIGITS SPACE . _ -] BY searchTermSchema, SO IT CANNOT INJECT FILTER SYNTAX.
  if (search) query = query.ilike('teacherSearchText', `%${search}%`);
  const rows = query.order('employeeCode').range(pagination.from, pagination.to).overrideTypes<Teacher[], { merge: false }>();
  return paginated(await page<Teacher>('teachers.list', rows, pagination, TEACHER_ERRORS));
});

/** ADMIN ONLY. CREATES THE LOGIN IDENTITY AND THE TEACHER ACCOUNT; THE ADMIN IS RECORDED AS THE ACTOR. RETURNS A SETUP CODE WHEN NO PASSWORD IS GIVEN. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { email, fullName, password, ...profile } = await parseJsonBody(request, createTeacherSchema);
  const account = unwrapResult(
    await provisionAccount({ role: 'TEACHER', email, fullName, password, profile }, { actorUserId: actor.id }),
  );
  const query = supabase
    .from('teachers')
    .select(TEACHER_COLUMNS)
    .eq('userId', account.userId)
    .maybeSingle()
    .overrideTypes<Teacher, { merge: false }>();
  const teacher = await one<Teacher>('teachers.getByUser', query, TEACHER_ERRORS);
  // WITHOUT AN INITIAL PASSWORD, THE PERSON SETS ONE WITH A ONE-TIME SETUP CODE, SHOWN TO THE ADMIN ONCE.
  // THE ACCOUNT ALREADY EXISTS, SO A FAILED ISSUE RETURNS `setupCode: null`; THE ADMIN CAN ISSUE ONE LATER.
  const issued = password ? null : await issueSetupCode(account.userId, { actor });
  return created({ ...teacher, setupCode: issued?.success ? issued.data : null });
});
