import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';
import type { RosterRow } from '@/types/teacher-class-roster';

/**
 * ONE CLASS'S STUDENTS IN ROLL ORDER: ITS ENROLLMENTS AND STUDENTS (ONE CLASS, A
 * BOUNDED LIST). RLS RETURNS NOTHING FOR A CLASS THE TEACHER DOESN'T TEACH.
 */
export async function loadClassRoster(classId: string): Promise<ApiResult<RosterRow[]>> {
  try {
    const [enrollments, students] = await Promise.all([
      fetchAllPages<Enrollment>(API_PATHS.enrollments, { classId }),
      fetchAllPages<Student>(API_PATHS.students, { classId }),
    ]);
    if (!enrollments.success) return enrollments;
    if (!students.success) return students;
    const studentById = new Map(students.data.map((student) => [student.id, student]));
    const rows = enrollments.data
      .map((enrollment) => ({ enrollment, student: studentById.get(enrollment.studentId) ?? null }))
      .sort(
        (first, second) =>
          (first.enrollment.rollNumber ?? Number.MAX_SAFE_INTEGER) - (second.enrollment.rollNumber ?? Number.MAX_SAFE_INTEGER) ||
          (first.student?.user.fullName ?? '').localeCompare(second.student?.user.fullName ?? ''),
      );
    return { success: true, message: 'Operation successful', data: rows };
  } catch {
    return networkFailure();
  }
}
