import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Teacher } from '@/types/teachers';

/** THE SIGNED-IN TEACHER'S OWN RECORD (ANY OTHER TEACHER'S IS A 403). */
export async function loadTeacherProfile(teacherId: string, signal: AbortSignal): Promise<ApiResult<Teacher>> {
  try {
    return await apiRequest<Teacher>(`${API_PATHS.teachers}/${encodeURIComponent(teacherId)}`, { signal });
  } catch {
    return networkFailure();
  }
}
