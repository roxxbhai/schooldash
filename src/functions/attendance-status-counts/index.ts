import 'client-only';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { countRecords } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult, QueryParams } from '@/types/api-client';
import type { AttendanceStatusCounts } from '@/types/attendance-status-counts';

/**
 * HOW MANY DAYS OF EACH STATUS BETWEEN `from` AND `to`: ONE limit=1 COUNT PER
 * STATUS (FOUR SMALL REQUESTS, NO ROWS DOWNLOADED). A FAILED COUNT IS NULL FOR THAT STATUS ONLY.
 * `path` IS THE STUDENT OR TEACHER ATTENDANCE LIST; `filters` NARROW IT (E.G. { studentId }).
 * RLS DECIDES WHICH ROWS ARE COUNTED: A STUDENT'S OWN, A TEACHER'S CLASSES, A TEACHER'S OWN DAYS.
 */
export async function loadAttendanceStatusCounts(
  path: string,
  filters: QueryParams,
  from: string,
  to: string,
): Promise<ApiResult<AttendanceStatusCounts>> {
  try {
    const counts = await Promise.all(ATTENDANCE_STATUS_OPTIONS.map((option) => countRecords(path, { ...filters, status: option.value, from, to })));
    const byStatus = Object.fromEntries(
      ATTENDANCE_STATUS_OPTIONS.map((option, index) => [option.value, counts[index]?.success ? counts[index].data : null]),
    ) as AttendanceStatusCounts;
    return { success: true, message: 'Operation successful', data: byStatus };
  } catch {
    return networkFailure();
  }
}
