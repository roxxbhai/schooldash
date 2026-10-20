import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { SubjectForm } from '@/constants/admin-subjects';
import type { ApiResult } from '@/types/api-client';
import type { Subject } from '@/types/subjects';

/** A BLANK DESCRIPTION IS SENT AS '' AND STORED AS NULL; ON EDIT THAT CLEARS IT. */
export async function createSubject(form: SubjectForm): Promise<ApiResult<Subject>> {
  try {
    return await createRecord<Subject>(API_PATHS.subjects, form);
  } catch {
    return networkFailure();
  }
}

export async function updateSubject(id: string, form: SubjectForm): Promise<ApiResult<Subject>> {
  try {
    return await updateRecord<Subject>(API_PATHS.subjects, id, form);
  } catch {
    return networkFailure();
  }
}
