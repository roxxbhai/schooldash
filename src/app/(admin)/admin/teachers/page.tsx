import type { Metadata } from 'next';
import { AdminTeachers } from '@/components/admin-teachers';

export const metadata: Metadata = { title: 'Teachers' };

export default function TeachersPage() {
  return <AdminTeachers />;
}
