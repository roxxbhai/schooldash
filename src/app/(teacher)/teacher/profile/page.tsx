import type { Metadata } from 'next';
import { TeacherProfile } from '@/components/teacher-profile';

export const metadata: Metadata = { title: 'My profile' };

export default function TeacherProfilePage() {
  return <TeacherProfile />;
}
