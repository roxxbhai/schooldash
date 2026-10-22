import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { StudentProfile } from '@/types/student-profile';
import type { Student } from '@/types/students';

/** THE STUDENT'S OWN RECORD (ANOTHER STUDENT'S ID IS A 403) AND THEIR ENROLLMENTS (A FEW ROWS, ONE PER YEAR). */
export async function loadStudentProfile(studentId: string, signal: AbortSignal): Promise<ApiResult<StudentProfile>> {
  try {
    const [student, enrollments] = await Promise.all([
      apiRequest<Student>(`${API_PATHS.students}/${encodeURIComponent(studentId)}`, { signal }),
      fetchAllPages<Enrollment>(API_PATHS.enrollments, { studentId }),
    ]);
    if (!student.success) return student;
    if (!enrollments.success) return enrollments;
    const newestFirst = [...enrollments.data].sort((first, second) => second.enrolledOn.localeCompare(first.enrolledOn));
    return { success: true, message: 'Operation successful', data: { student: student.data, enrollments: newestFirst } };
  } catch {
    return networkFailure();
  }
}
