import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { StudentForm } from '@/constants/admin-students';
import type { ApiResult } from '@/types/api-client';
import type { Student } from '@/types/students';

/** CREATES THE STUDENT AND THEIR LOGIN. NO PASSWORD: THEY SIGN IN WITH THEIR ADMISSION NUMBER. BLANK OPTIONAL FIELDS ARE LEFT OUT. */
export async function createStudent(form: StudentForm): Promise<ApiResult<Student>> {
  try {
    return await createRecord<Student>(API_PATHS.students, {
      fullName: form.fullName,
      email: form.email,
      admissionNumber: form.admissionNumber,
      admissionDate: form.admissionDate || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender || undefined,
      bloodGroup: form.bloodGroup || undefined,
      fatherName: form.fatherName || undefined,
      motherName: form.motherName || undefined,
      address: form.address || undefined,
    });
  } catch {
    return networkFailure();
  }
}
