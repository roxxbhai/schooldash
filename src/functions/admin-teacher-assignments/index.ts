import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, deleteRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AssignmentForm } from '@/constants/admin-teacher-assignments';
import type { ApiResult } from '@/types/api-client';
import type { TeacherAssignment } from '@/types/teacher-assignments';

export async function createTeacherAssignment(form: AssignmentForm): Promise<ApiResult<TeacherAssignment>> {
  try {
    const { teacherId, classId, subjectId } = form;
    return await createRecord<TeacherAssignment>(API_PATHS.teacherAssignments, { teacherId, classId, subjectId });
  } catch {
    return networkFailure();
  }
}

/** THE API REFUSES (409) WHILE TIMETABLE ENTRIES STILL USE THE ASSIGNMENT. */
export async function removeTeacherAssignment(id: string): Promise<ApiResult<TeacherAssignment>> {
  try {
    return await deleteRecord<TeacherAssignment>(API_PATHS.teacherAssignments, id);
  } catch {
    return networkFailure();
  }
}
