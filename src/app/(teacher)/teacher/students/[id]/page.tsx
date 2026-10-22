import type { Metadata } from 'next';
import { TeacherStudent } from '@/components/teacher-student';

export const metadata: Metadata = { title: 'Student' };

export default function TeacherStudentPage() {
  return <TeacherStudent />;
}
