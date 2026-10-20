import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { EditEnrollmentValues, EnrollValues } from '@/constants/admin-enrollments';
import type { EnrollmentRow } from '@/types/admin-enrollments';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/**
 * EVERY ENROLLMENT OF ONE CLASS WITH ITS STUDENT, SORTED BY ROLL NUMBER (NO ROLL
 * NUMBER LAST, THEN BY NAME). BOTH LISTS ARE BOUNDED BY THE CLASS SIZE.
 */
export async function loadClassRoster(classId: string): Promise<ApiResult<EnrollmentRow[]>> {
  try {
    const [enrollments, students] = await Promise.all([
      fetchAllPages<Enrollment>(API_PATHS.enrollments, { classId }),
      fetchAllPages<Student>(API_PATHS.students, { classId }),
    ]);
    if (!enrollments.success) return enrollments;
    if (!students.success) return students;

    const studentById = new Map(students.data.map((student) => [student.id, student]));
    const rows = enrollments.data.map((enrollment) => ({ enrollment, student: studentById.get(enrollment.studentId) ?? null }));
    rows.sort((first, second) => {
      const firstRoll = first.enrollment.rollNumber ?? Number.POSITIVE_INFINITY;
      const secondRoll = second.enrollment.rollNumber ?? Number.POSITIVE_INFINITY;
      if (firstRoll !== secondRoll) return firstRoll - secondRoll;
      return (first.student?.user.fullName ?? '').localeCompare(second.student?.user.fullName ?? '');
    });
    return { success: true, message: 'Operation successful', data: rows };
  } catch {
    return networkFailure();
  }
}

/** THE API TAKES THE ACADEMIC YEAR FROM THE CLASS. AN EMPTY ROLL NUMBER IS LEFT OUT (THE API DOESN'T ACCEPT NULL ON CREATE). */
export async function enrollStudent(values: EnrollValues): Promise<ApiResult<Enrollment>> {
  try {
    const { studentId, classId, rollNumber } = values;
    return await createRecord<Enrollment>(API_PATHS.enrollments, { studentId, classId, ...(rollNumber === null ? {} : { rollNumber }) });
  } catch {
    return networkFailure();
  }
}

/** SENDS ONLY THE FIELDS THAT CHANGED. THE CALLER SKIPS THE REQUEST WHEN NOTHING DID (THE API REJECTS AN EMPTY PATCH). */
export async function updateEnrollment(enrollment: Enrollment, values: EditEnrollmentValues): Promise<ApiResult<Enrollment>> {
  try {
    const changes = {
      ...(values.rollNumber === enrollment.rollNumber ? {} : { rollNumber: values.rollNumber }),
      ...(values.classId === enrollment.classId ? {} : { classId: values.classId }),
    };
    return await updateRecord<Enrollment>(API_PATHS.enrollments, enrollment.id, changes);
  } catch {
    return networkFailure();
  }
}
