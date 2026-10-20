import type { Metadata } from 'next';
import { AdminStudentAttendance } from '@/components/admin-student-attendance';

export const metadata: Metadata = { title: 'Student attendance' };

export default function StudentAttendancePage() {
  return <AdminStudentAttendance />;
}
