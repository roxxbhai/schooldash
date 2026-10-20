import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { ReportCard } from '@/types/report-cards';

/**
 * ONE STUDENT'S REPORT-CARD DATA FOR ONE EXAM. NULL (NOT AN ERROR) WHEN THE API
 * ANSWERS 404: THE STUDENT WAS NOT ENROLLED IN THAT EXAM'S ACADEMIC YEAR.
 */
export async function loadReportCard(studentId: string, examId: string, signal?: AbortSignal): Promise<ApiResult<ReportCard | null>> {
  try {
    const path = `${API_PATHS.students}/${encodeURIComponent(studentId)}/report-cards/${encodeURIComponent(examId)}`;
    const result = await apiRequest<ReportCard>(path, { signal });
    if (!result.success && result.data.status === 404) return { success: true, message: 'Operation successful', data: null };
    return result;
  } catch {
    return networkFailure();
  }
}
