import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { StudentForm } from '@/constants/admin-students';
import type { CreatedStudent } from '@/types/admin-students';
import type { ApiResult } from '@/types/api-client';

/** CREATES THE STUDENT AND THEIR LOGIN. NO PASSWORD IS SENT, SO THE SERVER ISSUES A SETUP CODE. BLANK OPTIONAL FIELDS ARE LEFT OUT. */
export async function createStudent(form: StudentForm): Promise<ApiResult<CreatedStudent>> {
  try {
    return await createRecord<CreatedStudent>(API_PATHS.students, {
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
