import 'server-only';
import { ASSIGNMENT_ERRORS } from '@/constants/teacher-assignments';
import { many } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** THE SUBJECTS A TEACHER IS ASSIGNED TO TEACH IN A CLASS. */
export async function assignedSubjectIds(client: DbClient, teacherId: string, classId: string): Promise<FunctionResult<Set<string>>> {
  try {
    const query = client.from('teacherAssignments').select('subjectId').eq('teacherId', teacherId).eq('classId', classId);
    const rows = await many<{ subjectId: string }>('teacherAssignments.subjects', query, ASSIGNMENT_ERRORS);
    return functionSuccess(new Set(rows.map((row) => row.subjectId)));
  } catch (error) {
    return functionFailure(error, 'teacherAssignments.subjects');
  }
}
