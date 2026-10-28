import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, createRecord, runRecordAction } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { GraduationResult, PromotionOptions, PromotionResult, PromotionStudentInput } from '@/types/class-promotion';
import type { SchoolClass } from '@/types/classes';

/** LATER CLASSES, WHERE THIS CLASS'S STUDENTS ALREADY MOVED, AND TAKEN ROLL NUMBERS. ADMINS AND THE CLASS TEACHER ONLY. */
export async function loadPromotionOptions(classId: string, signal?: AbortSignal): Promise<ApiResult<PromotionOptions>> {
  try {
    return await apiRequest<PromotionOptions>(`${API_PATHS.classes}/${encodeURIComponent(classId)}/promotion`, { signal });
  } catch {
    return networkFailure();
  }
}

/** MOVES THE STUDENTS OF `classId` INTO `targetClassId` (A LATER YEAR) IN ONE STEP. */
export async function promoteStudents(classId: string, targetClassId: string, students: PromotionStudentInput[]): Promise<ApiResult<PromotionResult>> {
  try {
    return await runRecordAction<PromotionResult>(API_PATHS.classes, classId, 'promote', { targetClassId, students });
  } catch {
    return networkFailure();
  }
}

/** CLASS 12: MARKS THE STUDENTS GRADUATED AND DEACTIVATES THEIR ACCOUNTS. */
export async function graduateStudents(classId: string, studentIds: string[]): Promise<ApiResult<GraduationResult>> {
  try {
    return await runRecordAction<GraduationResult>(API_PATHS.classes, classId, 'graduate', { studentIds });
  } catch {
    return networkFailure();
  }
}

/** ADMINS ONLY: CREATES THE CLASS THE STUDENTS ARE PROMOTED INTO, WHEN IT DOESN'T EXIST YET. */
export async function createPromotionClass(academicYearId: string, name: string, section: string): Promise<ApiResult<SchoolClass>> {
  try {
    return await createRecord<SchoolClass>(API_PATHS.classes, { academicYearId, name, section });
  } catch {
    return networkFailure();
  }
}
