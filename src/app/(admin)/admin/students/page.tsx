import type { Metadata } from 'next';
import { AdminStudents } from '@/components/admin-students';

export const metadata: Metadata = { title: 'Students' };

export default function StudentsPage() {
  return <AdminStudents />;
}
