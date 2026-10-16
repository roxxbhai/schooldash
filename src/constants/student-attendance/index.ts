import type { DbErrorContext } from '@/types/supabase';

export const STUDENT_ATTENDANCE_COLUMNS = 'id, studentId, classId, attendanceDate, status, remarks, markedByUserId, createdAt, updatedAt';

export const MAX_BULK_ATTENDANCE_RECORDS = 200;

export const STUDENT_ATTENDANCE_ERRORS: DbErrorContext = {
  notFoundMessage: 'Attendance record not found.',
  constraints: {
    studentAttendanceStudentDateKey: { message: 'Attendance for this student on this date already exists.' },
    studentAttendanceEnrollmentFkey: { message: 'The student is not enrolled in this class.', field: 'studentId' },
    attendanceDateNotFuture: { message: 'Attendance cannot be recorded for a future date.', field: 'attendanceDate' },
    attendanceDateInAcademicYear: { message: "The date is outside the class's academic year.", field: 'attendanceDate' },
    attendanceStudentActive: { message: "The student's account is deactivated.", field: 'studentId' },
  },
};
