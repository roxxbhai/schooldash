import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { StudentProfileForm } from '@/constants/admin-student-detail';
import type { ApiResult } from '@/types/api-client';
import type { Exam } from '@/types/exams';
import type { Student } from '@/types/students';

/** ONE STUDENT, OR `null` WHEN NO STUDENT HAS THIS ID (404, OR AN ID THAT ISN'T VALID). */
export async function loadStudent(id: string, signal: AbortSignal): Promise<ApiResult<Student | null>> {
  try {
    const result = await apiRequest<Student>(`${API_PATHS.students}/${encodeURIComponent(id)}`, { signal });
    if (!result.success && (result.data.code === 'NOT_FOUND' || result.data.code === 'VALIDATION_ERROR')) {
      return { success: true, message: 'Operation successful', data: null };
    }
    return result;
  } catch {
    return networkFailure();
  }
}

/** BLANK TEXT CLEARS A FIELD (THE SERVER STORES NULL); BLANK DATES AND UNSET CHOICES ARE SENT AS NULL. */
export async function updateStudent(id: string, form: StudentProfileForm): Promise<ApiResult<Student>> {
  try {
    return await updateRecord<Student>(API_PATHS.students, id, {
      fullName: form.fullName,
      phone: form.phone,
      admissionNumber: form.admissionNumber,
      admissionDate: form.admissionDate || null,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender,
      bloodGroup: form.bloodGroup,
      fatherName: form.fatherName,
      motherName: form.motherName,
      address: form.address,
    });
  } catch {
    return networkFailure();
  }
}

/** EVERY EXAM OF THE GIVEN ACADEMIC YEARS, ONE REQUEST PER YEAR IN PARALLEL. ANY FAILURE FAILS THE WHOLE LOAD. */
export async function loadExamsForYears(academicYearIds: readonly string[]): Promise<ApiResult<Exam[]>> {
  try {
    const results = await Promise.all(academicYearIds.map((academicYearId) => fetchAllPages<Exam>(API_PATHS.exams, { academicYearId })));
    const exams: Exam[] = [];
    for (const result of results) {
      if (!result.success) return result;
      exams.push(...result.data);
    }
    return { success: true, message: 'Operation successful', data: exams };
  } catch {
    return networkFailure();
  }
}
