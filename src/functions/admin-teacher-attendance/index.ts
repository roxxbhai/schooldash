import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AttendanceStatus } from '@/types/admin-attendance';
import type { TeacherRegisterData } from '@/types/admin-teacher-attendance';
import type { ApiResult } from '@/types/api-client';
import type { TeacherAttendance } from '@/types/teacher-attendance';

/** EVERY TEACHER ATTENDANCE RECORD FOR ONE DATE (AT MOST ONE PER TEACHER, SO A BOUNDED LIST). */
export async function loadTeacherAttendance(attendanceDate: string): Promise<ApiResult<TeacherRegisterData>> {
  try {
    const records = await fetchAllPages<TeacherAttendance>(API_PATHS.teacherAttendance, { date: attendanceDate });
    if (!records.success) return records;
    return { success: true, message: 'Operation successful', data: { attendanceDate, records: records.data } };
  } catch {
    return networkFailure();
  }
}

/** RECORDS ONE TEACHER FOR ONE DAY. THERE IS NO BULK ENDPOINT FOR TEACHERS. */
export async function createTeacherAttendance(input: {
  teacherId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  remarks?: string;
}): Promise<ApiResult<TeacherAttendance>> {
  try {
    return await createRecord<TeacherAttendance>(API_PATHS.teacherAttendance, input);
  } catch {
    return networkFailure();
  }
}

/** CORRECTS ONE RECORD. ONLY STATUS AND REMARKS CAN CHANGE. */
export async function updateTeacherAttendance(
  id: string,
  changes: { status?: AttendanceStatus; remarks?: string },
): Promise<ApiResult<TeacherAttendance>> {
  try {
    return await updateRecord<TeacherAttendance>(API_PATHS.teacherAttendance, id, changes);
  } catch {
    return networkFailure();
  }
}
