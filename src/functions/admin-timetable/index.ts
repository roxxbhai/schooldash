import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, deleteRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { TimetableValues } from '@/constants/admin-timetable';
import type { ApiResult, QueryParams } from '@/types/api-client';
import type { TeacherAssignment } from '@/types/teacher-assignments';
import type { TimetableEntry } from '@/types/timetable';

/** EVERY PERIOD MATCHING THE FILTER (ONE CLASS OR ONE TEACHER'S WEEK), ORDERED BY DAY AND START TIME. */
export async function loadTimetable(query: QueryParams): Promise<ApiResult<TimetableEntry[]>> {
  try {
    return await fetchAllPages<TimetableEntry>(API_PATHS.timetableEntries, query);
  } catch {
    return networkFailure();
  }
}

/** THE TEACHER IDS ASSIGNED TO TEACH THIS SUBJECT IN THIS CLASS: THE ONLY ONES WHO MAY STAFF ITS PERIODS. */
export async function loadEligibleTeacherIds(classId: string, subjectId: string): Promise<ApiResult<string[]>> {
  try {
    const result = await fetchAllPages<TeacherAssignment>(API_PATHS.teacherAssignments, { classId, subjectId });
    if (!result.success) return result;
    return { success: true, message: 'Operation successful', data: [...new Set(result.data.map((assignment) => assignment.teacherId))] };
  } catch {
    return networkFailure();
  }
}

export async function createTimetableEntry(values: TimetableValues): Promise<ApiResult<TimetableEntry>> {
  try {
    return await createRecord<TimetableEntry>(API_PATHS.timetableEntries, values);
  } catch {
    return networkFailure();
  }
}

/** SENDS EVERY FIELD; THE API VALIDATES THE COMPLETE RESULTING PERIOD (STAFFING AND CONFLICTS). */
export async function updateTimetableEntry(id: string, values: TimetableValues): Promise<ApiResult<TimetableEntry>> {
  try {
    return await updateRecord<TimetableEntry>(API_PATHS.timetableEntries, id, values);
  } catch {
    return networkFailure();
  }
}

export async function deleteTimetableEntry(id: string): Promise<ApiResult<TimetableEntry>> {
  try {
    return await deleteRecord<TimetableEntry>(API_PATHS.timetableEntries, id);
  } catch {
    return networkFailure();
  }
}
