import type { Metadata } from 'next';
import { TeacherClassRoster } from '@/components/teacher-class-roster';

export const metadata: Metadata = { title: 'Class' };

export default function TeacherClassRosterPage() {
  return <TeacherClassRoster />;
}
