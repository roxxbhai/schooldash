import type { Metadata } from 'next';
import { AdminStudentAttendance } from '@/components/admin-student-attendance';

export const metadata: Metadata = { title: 'Attendance' };

export default function TeacherAttendancePage() {
  return <AdminStudentAttendance role='TEACHER' />;
}
