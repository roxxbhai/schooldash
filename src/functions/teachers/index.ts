import 'server-only';
import { TEACHER_COLUMNS, TEACHER_ERRORS, TEACHER_STATUS_COLUMNS } from '@/constants/teachers';
import { validationError } from '@/helpers/api-error';
import { maybeOne, one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';
import type { Teacher, TeacherStatus } from '@/types/teachers';

/** A TEACHER WITH THEIR ACCOUNT DETAILS, AS THE CALLER MAY SEE THEM (RLS); 404 OTHERWISE. */
export async function findTeacher(client: DbClient, id: string): Promise<FunctionResult<Teacher>> {
  try {
    const query = client.from('teachers').select(TEACHER_COLUMNS).eq('id', id).maybeSingle().overrideTypes<Teacher, { merge: false }>();
    return functionSuccess(await one<Teacher>('teachers.get', query, TEACHER_ERRORS));
  } catch (error) {
    return functionFailure(error, 'teachers.get');
  }
}

/**
 * A TEACHER REFERENCED BY A REQUEST (CLASS TEACHER, ASSIGNEE, TIMETABLE, ATTENDANCE)
 * MUST EXIST AND BE ACTIVE: 422 ON `field` OTHERWISE. NO TEACHER (NULL) IS FINE.
 */
export async function requireActiveTeacher(
  client: DbClient,
  teacherId: string | null | undefined,
  field = 'teacherId',
): Promise<FunctionResult<null>> {
  try {
    if (!teacherId) return functionSuccess(null);
    const query = client
      .from('teachers')
      .select(TEACHER_STATUS_COLUMNS)
      .eq('id', teacherId)
      .maybeSingle()
      .overrideTypes<TeacherStatus, { merge: false }>();
    const teacher = await maybeOne<TeacherStatus>('teachers.status', query, TEACHER_ERRORS);
    if (!teacher) throw validationError([{ path: field, message: 'Teacher not found.' }]);
    if (!teacher.user?.isActive) throw validationError([{ path: field, message: "The teacher's account is deactivated." }]);
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'teachers.requireActive');
  }
}
