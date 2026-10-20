import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, createRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ExamForm } from '@/constants/admin-exams';
import type { ApiResult } from '@/types/api-client';
import type { Exam } from '@/types/exams';

/** BLANK DATES ARE LEFT OUT: ON CREATE THE API TAKES THEM AS OPTIONAL, NOT NULLABLE. */
export async function createExam(form: ExamForm): Promise<ApiResult<Exam>> {
  try {
    const { academicYearId, name, startDate, endDate } = form;
    return await createRecord<Exam>(API_PATHS.exams, {
      academicYearId,
      name,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
  } catch {
    return networkFailure();
  }
}

/** THE ACADEMIC YEAR OF AN EXAM NEVER CHANGES, SO IT IS NOT SENT. A BLANK DATE CLEARS IT. */
export async function updateExam(id: string, form: ExamForm): Promise<ApiResult<Exam>> {
  try {
    const { name, startDate, endDate } = form;
    return await updateRecord<Exam>(API_PATHS.exams, id, { name, startDate: startDate || null, endDate: endDate || null });
  } catch {
    return networkFailure();
  }
}

/** ONE EXAM, OR NULL WHEN IT DOESN'T EXIST (404), SO THE PAGE CAN SAY SO RATHER THAN SHOW AN ERROR. */
export async function loadExam(id: string, signal?: AbortSignal): Promise<ApiResult<Exam | null>> {
  try {
    const result = await apiRequest<Exam>(`${API_PATHS.exams}/${encodeURIComponent(id)}`, { signal });
    if (!result.success && result.data.status === 404) return { success: true, message: 'Operation successful', data: null };
    return result;
  } catch {
    return networkFailure();
  }
}

/** EVERY EXAM OF ONE ACADEMIC YEAR, EARLIEST FIRST (UNDATED EXAMS LAST, THEN BY NAME). A YEAR HAS A HANDFUL. */
export async function loadYearExams(academicYearId: string): Promise<ApiResult<Exam[]>> {
  try {
    const result = await fetchAllPages<Exam>(API_PATHS.exams, { academicYearId });
    if (!result.success) return result;
    const exams = [...result.data].sort(
      (first, second) => (first.startDate ?? '9999').localeCompare(second.startDate ?? '9999') || first.name.localeCompare(second.name),
    );
    return { success: true, message: 'Operation successful', data: exams };
  } catch {
    return networkFailure();
  }
}
