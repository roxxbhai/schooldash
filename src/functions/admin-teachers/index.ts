import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { TeacherForm } from '@/constants/admin-teachers';
import type { ApiResult } from '@/types/api-client';
import type { Teacher } from '@/types/teachers';

/** CREATES THE TEACHER AND THEIR LOGIN. NO PASSWORD: THEY SIGN UP WITH THEIR MOBILE NUMBER. BLANK OPTIONAL FIELDS (INCLUDING EMAIL) ARE LEFT OUT. */
export async function createTeacher(form: TeacherForm): Promise<ApiResult<Teacher>> {
  try {
    const { fullName, email, phone, qualification, dateOfJoining } = form;
    return await createRecord<Teacher>(API_PATHS.teachers, {
      fullName,
      email: email || undefined,
      phone,
      qualification: qualification || undefined,
      dateOfJoining: dateOfJoining || undefined,
    });
  } catch {
    return networkFailure();
  }
}
