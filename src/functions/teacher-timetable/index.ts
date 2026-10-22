import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { TimetableEntry } from '@/types/timetable';

/** THE TEACHER'S OWN PERIODS FOR A YEAR (RLS ALSO SHOWS OTHER TEACHERS' PERIODS IN THEIR CLASSES, SO FILTER BY teacherId). */
export async function loadTeacherTimetable(teacherId: string, academicYearId: string): Promise<ApiResult<TimetableEntry[]>> {
  try {
    return await fetchAllPages<TimetableEntry>(API_PATHS.timetableEntries, { teacherId, academicYearId });
  } catch {
    return networkFailure();
  }
}
