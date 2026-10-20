import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ClassForm } from '@/constants/admin-classes';
import type { ApiResult } from '@/types/api-client';
import type { SchoolClass } from '@/types/classes';

export async function createClass(form: ClassForm): Promise<ApiResult<SchoolClass>> {
  try {
    return await createRecord<SchoolClass>(API_PATHS.classes, form);
  } catch {
    return networkFailure();
  }
}

/** THE ACADEMIC YEAR OF A CLASS NEVER CHANGES (IT WOULD MOVE ITS ENROLLMENTS), SO IT IS NOT SENT. */
export async function updateClass(id: string, form: ClassForm): Promise<ApiResult<SchoolClass>> {
  try {
    const { name, section, classTeacherId, roomNumber } = form;
    return await updateRecord<SchoolClass>(API_PATHS.classes, id, { name, section, classTeacherId, roomNumber });
  } catch {
    return networkFailure();
  }
}
