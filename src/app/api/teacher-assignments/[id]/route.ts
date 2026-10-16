import { ASSIGNMENT_COLUMNS, ASSIGNMENT_ERRORS } from '@/constants/teacher-assignments';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { TeacherAssignment } from '@/types/teacher-assignments';

type Context = RouteContext<'/api/teacher-assignments/[id]'>;

/** VISIBLE PER RLS; OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const query = supabase.from('teacherAssignments').select(ASSIGNMENT_COLUMNS).eq('id', id).maybeSingle();
  return ok(await one<TeacherAssignment>('teacherAssignments.get', query, ASSIGNMENT_ERRORS));
});

/** ADMIN ONLY. RETURNS THE REMOVED ROW. 409 WHILE TIMETABLE ENTRIES USE THE ASSIGNMENT (DATABASE FOREIGN KEY). */
export const DELETE = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const query = supabase.from('teacherAssignments').delete().eq('id', id).select(ASSIGNMENT_COLUMNS).maybeSingle();
  return ok(await one<TeacherAssignment>('teacherAssignments.delete', query, ASSIGNMENT_ERRORS));
});
