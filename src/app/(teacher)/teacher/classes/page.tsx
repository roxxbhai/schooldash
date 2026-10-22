import type { Metadata } from 'next';
import { TeacherClasses } from '@/components/teacher-classes';

export const metadata: Metadata = { title: 'My classes' };

export default function TeacherClassesPage() {
  return <TeacherClasses />;
}
