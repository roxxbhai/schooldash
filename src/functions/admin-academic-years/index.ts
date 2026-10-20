import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, runRecordAction, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AcademicYearForm } from '@/constants/admin-academic-years';
import type { AcademicYear } from '@/types/academic-years';
import type { ApiResult } from '@/types/api-client';

export async function createAcademicYear(form: AcademicYearForm): Promise<ApiResult<AcademicYear>> {
  try {
    return await createRecord<AcademicYear>(API_PATHS.academicYears, form);
  } catch {
    return networkFailure();
  }
}

export async function updateAcademicYear(id: string, form: AcademicYearForm): Promise<ApiResult<AcademicYear>> {
  try {
    return await updateRecord<AcademicYear>(API_PATHS.academicYears, id, form);
  } catch {
    return networkFailure();
  }
}

/** MAKES THIS THE ONLY CURRENT YEAR (ONE TRANSACTION ON THE SERVER). */
export async function setCurrentAcademicYear(id: string): Promise<ApiResult<AcademicYear>> {
  try {
    return await runRecordAction<AcademicYear>(API_PATHS.academicYears, id, 'set-current');
  } catch {
    return networkFailure();
  }
}
