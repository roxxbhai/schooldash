import { z } from 'zod';
import { CLASS_COLUMNS, CLASS_ERRORS, CLASS_NAME_SCHEMA, CLASS_SECTION_SCHEMA } from '@/constants/classes';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { requireActiveTeacher } from '@/functions/teachers';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { optionalText } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { SchoolClass } from '@/types/classes';

/**
 * CLASSES (A GRADE + SECTION WITHIN ONE ACADEMIC YEAR).
 * - READ: RLS-SCOPED — ADMINS ALL, TEACHERS THE CLASSES THEY TEACH, STUDENTS THEIR CLASS.
 * - WRITE: ADMINS. THE ACADEMIC YEAR IS FIXED AT CREATION (MOVING A CLASS WOULD
 *   ORPHAN ITS ENROLLMENTS AND EXAM PAPERS). CLASSES ARE NEVER DELETED.
 * - A CLASS TEACHER MUST BE AN EXISTING, ACTIVE TEACHER.
 */

const createClassSchema = z.strictObject({
  academicYearId: uuidSchema,
  name: CLASS_NAME_SCHEMA,
  section: CLASS_SECTION_SCHEMA,
  classTeacherId: uuidSchema.nullable().optional(),
  roomNumber: optionalText(20),
});
const listClassesQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

/** RLS-SCOPED. ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const { academicYearId } = parseQuery(searchParams, listClassesQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('classes').select(CLASS_COLUMNS, { count: 'exact' });
  if (academicYearId) query = query.eq('academicYearId', academicYearId);
  const rows = query.order('name').order('section').order('id').range(pagination.from, pagination.to);
  return paginated(await page<SchoolClass>('classes.list', rows, pagination, CLASS_ERRORS));
});

/** ADMIN ONLY. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const newClass = await parseJsonBody(request, createClassSchema);
  unwrapResult(await requireActiveTeacher(supabase, newClass.classTeacherId, 'classTeacherId'));
  const query = supabase.from('classes').insert(newClass).select(CLASS_COLUMNS).maybeSingle();
  return created(await one<SchoolClass>('classes.insert', query, CLASS_ERRORS));
});
