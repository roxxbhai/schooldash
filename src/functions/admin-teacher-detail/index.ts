import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { TeacherProfileForm } from '@/constants/admin-teacher-detail';
import type { ApiResult } from '@/types/api-client';
import type { Teacher } from '@/types/teachers';

/** ONE TEACHER, OR `null` WHEN NO TEACHER HAS THIS ID (404, OR AN ID THAT ISN'T VALID). */
export async function loadTeacher(id: string, signal: AbortSignal): Promise<ApiResult<Teacher | null>> {
  try {
    const result = await apiRequest<Teacher>(`${API_PATHS.teachers}/${encodeURIComponent(id)}`, { signal });
    if (!result.success && (result.data.code === 'NOT_FOUND' || result.data.code === 'VALIDATION_ERROR')) {
      return { success: true, message: 'Operation successful', data: null };
    }
    return result;
  } catch {
    return networkFailure();
  }
}

/** BLANK TEXT CLEARS A FIELD (THE SERVER STORES NULL); A BLANK DATE IS SENT AS NULL. */
export async function updateTeacher(id: string, form: TeacherProfileForm): Promise<ApiResult<Teacher>> {
  try {
    const { fullName, phone, qualification, dateOfJoining } = form;
    return await updateRecord<Teacher>(API_PATHS.teachers, id, {
      fullName,
      phone,
      qualification,
      dateOfJoining: dateOfJoining || null,
    });
  } catch {
    return networkFailure();
  }
}
