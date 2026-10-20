import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { TeacherForm } from '@/constants/admin-teachers';
import type { CreatedTeacher } from '@/types/admin-teachers';
import type { ApiResult } from '@/types/api-client';

/** CREATES THE TEACHER AND THEIR LOGIN. NO PASSWORD IS SENT, SO THE SERVER ISSUES A SETUP CODE. BLANK OPTIONAL FIELDS ARE LEFT OUT. */
export async function createTeacher(form: TeacherForm): Promise<ApiResult<CreatedTeacher>> {
  try {
    const { fullName, email, employeeCode, qualification, dateOfJoining } = form;
    return await createRecord<CreatedTeacher>(API_PATHS.teachers, {
      fullName,
      email,
      employeeCode,
      qualification: qualification || undefined,
      dateOfJoining: dateOfJoining || undefined,
    });
  } catch {
    return networkFailure();
  }
}
