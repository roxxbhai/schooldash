import type { Metadata } from 'next';
import { TeacherTimetable } from '@/components/teacher-timetable';

export const metadata: Metadata = { title: 'Timetable' };

export default function TeacherTimetablePage() {
  return <TeacherTimetable />;
}
