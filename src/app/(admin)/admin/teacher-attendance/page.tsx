import type { Metadata } from 'next';
import { AdminTeacherAttendance } from '@/components/admin-teacher-attendance';

export const metadata: Metadata = { title: 'Teacher attendance' };

export default function TeacherAttendancePage() {
  return <AdminTeacherAttendance />;
}
