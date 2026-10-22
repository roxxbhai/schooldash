import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { StudentTimetable } from '@/types/student-timetable';
import type { TimetableEntry } from '@/types/timetable';

/** THE STUDENT'S CLASS IN `academicYearId`, THEN THAT CLASS'S PERIODS (A WEEK IS A SHORT LIST). */
export async function loadStudentTimetable(studentId: string, academicYearId: string): Promise<ApiResult<StudentTimetable>> {
  try {
    const enrollments = await fetchAllPages<Enrollment>(API_PATHS.enrollments, { studentId, academicYearId });
    if (!enrollments.success) return enrollments;
    const enrollment = enrollments.data[0] ?? null;
    if (!enrollment) return { success: true, message: 'Operation successful', data: { enrollment: null, entries: [] } };

    const entries = await fetchAllPages<TimetableEntry>(API_PATHS.timetableEntries, { classId: enrollment.classId, academicYearId });
    if (!entries.success) return entries;
    return { success: true, message: 'Operation successful', data: { enrollment, entries: entries.data } };
  } catch {
    return networkFailure();
  }
}
