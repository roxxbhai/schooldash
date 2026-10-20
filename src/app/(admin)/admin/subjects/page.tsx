import type { Metadata } from 'next';
import { AdminSubjects } from '@/components/admin-subjects';

export const metadata: Metadata = { title: 'Subjects' };

export default function SubjectsPage() {
  return <AdminSubjects />;
}
