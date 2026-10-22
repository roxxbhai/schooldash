import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Notice } from '@/types/notices';

/**
 * ONE NOTICE, OR `null` WHEN THE PERSON MAY NOT SEE IT: RLS ANSWERS 404 FOR AN
 * UNPUBLISHED NOTICE OR ONE ADDRESSED TO SOMEONE ELSE, EXACTLY AS FOR AN UNKNOWN ID.
 */
export async function loadNotice(id: string, signal: AbortSignal): Promise<ApiResult<Notice | null>> {
  try {
    const result = await apiRequest<Notice>(`${API_PATHS.notices}/${encodeURIComponent(id)}`, { signal });
    if (!result.success && (result.data.code === 'NOT_FOUND' || result.data.code === 'VALIDATION_ERROR')) {
      return { success: true, message: 'Operation successful', data: null };
    }
    return result;
  } catch {
    return networkFailure();
  }
}
