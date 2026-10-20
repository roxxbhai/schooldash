import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AttendanceStatus } from '@/types/admin-attendance';
import type { BulkStudentAttendanceInput, BulkStudentAttendanceResult, StudentRegisterData } from '@/types/admin-student-attendance';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { StudentAttendance } from '@/types/student-attendance';
import type { Student } from '@/types/students';

/**
 * THE ROSTER (ENROLLMENTS WITH ROLL NUMBERS), THE STUDENTS' NAMES AND THE
 * RECORDS ALREADY TAKEN FOR ONE CLASS AND DATE. ONE CLASS IS A BOUNDED LIST.
 */
export async function loadStudentRegister(classId: string, attendanceDate: string): Promise<ApiResult<StudentRegisterData>> {
  try {
    const [enrollments, students, records] = await Promise.all([
      fetchAllPages<Enrollment>(API_PATHS.enrollments, { classId }),
      fetchAllPages<Student>(API_PATHS.students, { classId }),
      fetchAllPages<StudentAttendance>(API_PATHS.studentAttendance, { classId, date: attendanceDate }),
    ]);
    if (!enrollments.success) return enrollments;
    if (!students.success) return students;
    if (!records.success) return records;
    return { success: true, message: 'Operation successful', data: { classId, attendanceDate, enrollments: enrollments.data, students: students.data, records: records.data } };
  } catch {
    return networkFailure();
  }
}

/** RECORDS MANY STUDENTS AT ONCE. ALL-OR-NOTHING: ANY INVALID RECORD REJECTS THE WHOLE SUBMISSION. */
export async function createStudentAttendanceBulk(input: BulkStudentAttendanceInput): Promise<ApiResult<BulkStudentAttendanceResult>> {
  try {
    return await createRecord<BulkStudentAttendanceResult>(`${API_PATHS.studentAttendance}/bulk`, input);
  } catch {
    return networkFailure();
  }
}

/** CORRECTS ONE RECORD. ONLY STATUS AND REMARKS CAN CHANGE. */
export async function updateStudentAttendance(
  id: string,
  changes: { status?: AttendanceStatus; remarks?: string },
): Promise<ApiResult<StudentAttendance>> {
  try {
    return await updateRecord<StudentAttendance>(API_PATHS.studentAttendance, id, changes);
  } catch {
    return networkFailure();
  }
}
