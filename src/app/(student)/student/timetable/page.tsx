import type { Metadata } from 'next';
import { StudentTimetable } from '@/components/student-timetable';

export const metadata: Metadata = { title: 'My timetable' };

export default function StudentTimetablePage() {
  return <StudentTimetable />;
}
