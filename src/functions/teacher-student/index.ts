import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';
import type { TeacherStudentData } from '@/types/teacher-student';

/** A STUDENT THE TEACHER TEACHES, OR `null` FOR ANYONE ELSE (THE API ANSWERS 404, AS FOR AN UNKNOWN ID). */
export async function loadTeacherStudent(studentId: string, signal: AbortSignal): Promise<ApiResult<TeacherStudentData | null>> {
  try {
    const [student, enrollments] = await Promise.all([
      apiRequest<Student>(`${API_PATHS.students}/${encodeURIComponent(studentId)}`, { signal }),
      fetchAllPages<Enrollment>(API_PATHS.enrollments, { studentId }),
    ]);
    if (!student.success) {
      const isHidden = student.data.code === 'NOT_FOUND' || student.data.code === 'VALIDATION_ERROR' || student.data.code === 'FORBIDDEN';
      return isHidden ? { success: true, message: 'Operation successful', data: null } : student;
    }
    if (!enrollments.success) return enrollments;
    return { success: true, message: 'Operation successful', data: { student: student.data, enrollments: enrollments.data } };
  } catch {
    return networkFailure();
  }
}
