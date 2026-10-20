import type { Enrollment } from '@/types/enrollments';
import type { StudentAttendance } from '@/types/student-attendance';
import type { Student } from '@/types/students';
import type { AttendanceStatus } from '@/types/admin-attendance';

/** EVERYTHING THE STUDENT REGISTER NEEDS FOR ONE CLASS AND DATE. */
export interface StudentRegisterData {
  /** WHICH REGISTER THIS DATA BELONGS TO, SO AN OLDER CLASS OR DATE IS NEVER SHOWN AS THE CURRENT ONE. */
  classId: string;
  attendanceDate: string;
  enrollments: Enrollment[];
  students: Student[];
  records: StudentAttendance[];
}

export interface BulkStudentAttendanceInput {
  classId: string;
  attendanceDate: string;
  records: { studentId: string; status: AttendanceStatus; remarks?: string }[];
}

export interface BulkStudentAttendanceResult {
  items: StudentAttendance[];
  count: number;
}
