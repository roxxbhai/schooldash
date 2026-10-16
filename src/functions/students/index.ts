import 'server-only';
import { STUDENT_COLUMNS, STUDENT_ERRORS, STUDENT_STATUS_COLUMNS } from '@/constants/students';
import { validationError } from '@/helpers/api-error';
import { many, maybeOne, one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { FunctionResult } from '@/types/function-result';
import type { Student, StudentStatus } from '@/types/students';
import type { DbClient } from '@/types/supabase';

/** A STUDENT WITH THEIR ACCOUNT DETAILS, AS THE CALLER MAY SEE THEM (RLS); 404 OTHERWISE. */
export async function findStudent(client: DbClient, id: string): Promise<FunctionResult<Student>> {
  try {
    const query = client.from('students').select(STUDENT_COLUMNS).eq('id', id).maybeSingle().overrideTypes<Student, { merge: false }>();
    return functionSuccess(await one<Student>('students.get', query, STUDENT_ERRORS));
  } catch (error) {
    return functionFailure(error, 'students.get');
  }
}

/** A STUDENT REFERENCED BY A REQUEST MUST EXIST AND BE ACTIVE: 422 ON `field` OTHERWISE. */
export async function requireActiveStudent(client: DbClient, studentId: string, field = 'studentId'): Promise<FunctionResult<null>> {
  try {
    const query = client
      .from('students')
      .select(STUDENT_STATUS_COLUMNS)
      .eq('id', studentId)
      .maybeSingle()
      .overrideTypes<StudentStatus, { merge: false }>();
    const student = await maybeOne<StudentStatus>('students.status', query, STUDENT_ERRORS);
    if (!student) throw validationError([{ path: field, message: 'Student not found.' }]);
    if (!student.user?.isActive) throw validationError([{ path: field, message: "The student's account is deactivated." }]);
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'students.requireActive');
  }
}

/** ACCOUNT STATUS OF EACH VISIBLE STUDENT AMONG `studentIds` (ABSENT = UNKNOWN OR HIDDEN). */
export async function studentActiveStates(client: DbClient, studentIds: string[]): Promise<FunctionResult<Map<string, boolean>>> {
  try {
    const query = client
      .from('students')
      .select(STUDENT_STATUS_COLUMNS)
      .in('id', studentIds)
      .overrideTypes<StudentStatus[], { merge: false }>();
    const rows = await many<StudentStatus>('students.activeStates', query, STUDENT_ERRORS);
    return functionSuccess(new Map(rows.map((row) => [row.id, row.user?.isActive === true])));
  } catch (error) {
    return functionFailure(error, 'students.activeStates');
  }
}
