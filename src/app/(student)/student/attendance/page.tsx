import type { Metadata } from 'next';
import { StudentAttendanceHistory } from '@/components/student-attendance-history';

export const metadata: Metadata = { title: 'My attendance' };

export default function StudentAttendancePage() {
  return <StudentAttendanceHistory />;
}
