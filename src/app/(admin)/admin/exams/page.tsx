import type { Metadata } from 'next';
import { AdminExams } from '@/components/admin-exams';

export const metadata: Metadata = { title: 'Exams' };

export default function ExamsPage() {
  return <AdminExams />;
}
