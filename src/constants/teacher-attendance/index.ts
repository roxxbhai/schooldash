import type { DbErrorContext } from '@/types/supabase';

export const TEACHER_ATTENDANCE_COLUMNS = 'id, teacherId, attendanceDate, status, remarks, markedByUserId, createdAt, updatedAt';

export const TEACHER_ATTENDANCE_ERRORS: DbErrorContext = {
  notFoundMessage: 'Attendance record not found.',
  constraints: {
    teacherAttendanceTeacherDateKey: { message: 'Attendance for this teacher on this date already exists.' },
    teacherAttendance_teacherId_fkey: { message: 'Teacher not found.', field: 'teacherId' },
    attendanceDateNotFuture: { message: 'Attendance cannot be recorded for a future date.', field: 'attendanceDate' },
    attendanceTeacherActive: { message: "The teacher's account is deactivated.", field: 'teacherId' },
  },
};
