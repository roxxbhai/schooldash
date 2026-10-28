import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { StudentValues } from '@/constants/admin-students';
import type { CreatedStudent } from '@/types/admin-students';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';

/**
 * CREATES THE STUDENT AND THEIR LOGIN, AND ENROLLS THEM WHEN A CLASS IS CHOSEN. NO PASSWORD: THEY
 * SIGN IN WITH THEIR ADMISSION NUMBER. BLANK OPTIONAL FIELDS (INCLUDING EMAIL) ARE LEFT OUT.
 */
export async function createStudent(values: StudentValues): Promise<ApiResult<CreatedStudent>> {
  try {
    return await createRecord<CreatedStudent>(API_PATHS.students, {
      fullName: values.fullName,
      email: values.email || undefined,
      admissionNumber: values.admissionNumber,
      admissionDate: values.admissionDate || undefined,
      dateOfBirth: values.dateOfBirth || undefined,
      gender: values.gender || undefined,
      bloodGroup: values.bloodGroup || undefined,
      fatherName: values.fatherName || undefined,
      motherName: values.motherName || undefined,
      address: values.address || undefined,
      classId: values.classId || undefined,
      rollNumber: values.classId && values.rollNumber !== null ? values.rollNumber : undefined,
    });
  } catch {
    return networkFailure();
  }
}

/** THE ROLL NUMBER AFTER THE HIGHEST ONE IN THE CLASS ("1" FOR AN EMPTY CLASS). THE LIST IS BOUNDED BY THE CLASS SIZE. */
export async function loadNextRollNumber(classId: string): Promise<ApiResult<string>> {
  try {
    const enrollments = await fetchAllPages<Enrollment>(API_PATHS.enrollments, { classId });
    if (!enrollments.success) return enrollments;
    const highest = Math.max(0, ...enrollments.data.map((enrollment) => enrollment.rollNumber ?? 0));
    return { success: true, message: 'Operation successful', data: String(highest + 1) };
  } catch {
    return networkFailure();
  }
}
