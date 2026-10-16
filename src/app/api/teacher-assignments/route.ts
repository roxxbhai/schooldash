import { z } from 'zod';
import { ASSIGNMENT_COLUMNS, ASSIGNMENT_ERRORS } from '@/constants/teacher-assignments';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { requireActiveTeacher } from '@/functions/teachers';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { TeacherAssignment } from '@/types/teacher-assignments';

/**
 * TEACHER ASSIGNMENTS: WHICH TEACHER TEACHES WHICH SUBJECT TO WHICH CLASS.
 * EVERY TEACHER PERMISSION CHECK (RLS AND THE APP) IS BUILT ON THESE ROWS, SO
 * ONLY ADMINS CREATE OR REMOVE THEM — A TEACHER CANNOT ASSIGN THEMSELVES.
 * THERE IS NO UPDATE: CHANGE AN ASSIGNMENT BY REMOVING AND RE-ADDING IT.
 */

const createAssignmentSchema = z.strictObject({ teacherId: uuidSchema, classId: uuidSchema, subjectId: uuidSchema });
const listAssignmentsQuerySchema = z.object({
  teacherId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
});

/** ADMINS: ALL. TEACHERS: THEIR OWN. STUDENTS: THEIR CLASS'S (RLS). ?teacherId= ?classId= ?subjectId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listAssignmentsQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('teacherAssignments').select(ASSIGNMENT_COLUMNS, { count: 'exact' });
  if (filters.teacherId) query = query.eq('teacherId', filters.teacherId);
  if (filters.classId) query = query.eq('classId', filters.classId);
  if (filters.subjectId) query = query.eq('subjectId', filters.subjectId);
  const rows = query.order('createdAt', { ascending: false }).order('id').range(pagination.from, pagination.to);
  return paginated(await page<TeacherAssignment>('teacherAssignments.list', rows, pagination, ASSIGNMENT_ERRORS));
});

/** ADMIN ONLY. THE TEACHER MUST BE ACTIVE; CLASS AND SUBJECT MUST EXIST (DATABASE FOREIGN KEYS → 422). */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const assignment = await parseJsonBody(request, createAssignmentSchema);
  unwrapResult(await requireActiveTeacher(supabase, assignment.teacherId));
  const query = supabase.from('teacherAssignments').insert(assignment).select(ASSIGNMENT_COLUMNS).maybeSingle();
  return created(await one<TeacherAssignment>('teacherAssignments.insert', query, ASSIGNMENT_ERRORS));
});
