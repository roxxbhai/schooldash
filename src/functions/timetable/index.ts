import 'server-only';
import { teacherHasAssignment } from '@/functions/authorization';
import { requireActiveTeacher } from '@/functions/teachers';
import { validationError } from '@/helpers/api-error';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';
import type { PeriodStaffing } from '@/types/timetable';

/**
 * A PERIOD'S TEACHER IS OPTIONAL (AN UNSTAFFED PERIOD). WHEN GIVEN, THE TEACHER
 * MUST BE ACTIVE AND ASSIGNED TO EXACTLY THIS CLASS AND SUBJECT (422 ON
 * teacherId) — THE SAME RULE THE DATABASE'S COMPOSITE FOREIGN KEY ENFORCES.
 */
export async function validateStaffing(client: DbClient, { classId, subjectId, teacherId }: PeriodStaffing): Promise<FunctionResult<null>> {
  try {
    if (!teacherId) return functionSuccess(null);
    unwrapResult(await requireActiveTeacher(client, teacherId));
    if (!unwrapResult(await teacherHasAssignment(client, { teacherId, classId, subjectId }))) {
      throw validationError([{ path: 'teacherId', message: 'The teacher is not assigned to teach this subject in this class.' }]);
    }
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'timetable.validateStaffing');
  }
}
