import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { countRecords, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { TeacherAssignment } from '@/types/teacher-assignments';
import type { TeacherClassesData } from '@/types/teacher-classes';

/** THE SIGNED-IN TEACHER'S OWN ASSIGNMENTS (RLS RETURNS NO ONE ELSE'S). */
export async function loadTeacherAssignments(): Promise<ApiResult<TeacherAssignment[]>> {
  try {
    return await fetchAllPages<TeacherAssignment>(API_PATHS.teacherAssignments);
  } catch {
    return networkFailure();
  }
}

/** THEIR ASSIGNMENTS, PLUS ONE limit=1 ENROLLMENT COUNT PER CLASS (NO STUDENT LISTS DOWNLOADED). */
export async function loadTeacherClasses(classIds: readonly string[]): Promise<ApiResult<TeacherClassesData>> {
  try {
    const [assignments, counts] = await Promise.all([
      loadTeacherAssignments(),
      Promise.all(classIds.map((classId) => countRecords(API_PATHS.enrollments, { classId }))),
    ]);
    if (!assignments.success) return assignments;
    const studentCounts = Object.fromEntries(classIds.map((classId, index) => [classId, counts[index]?.success ? counts[index].data : null]));
    return { success: true, message: 'Operation successful', data: { assignments: assignments.data, studentCounts } };
  } catch {
    return networkFailure();
  }
}
