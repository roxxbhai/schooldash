import type { TeacherAttendance } from '@/types/teacher-attendance';

/** THE RECORDS FOR ONE DATE, TAGGED WITH THAT DATE SO AN OLDER ANSWER IS NEVER SHOWN AS THE CURRENT ONE. */
export interface TeacherRegisterData {
  attendanceDate: string;
  records: TeacherAttendance[];
}
