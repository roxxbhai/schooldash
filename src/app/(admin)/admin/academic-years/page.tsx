import type { Metadata } from 'next';
import { AdminAcademicYears } from '@/components/admin-academic-years';

export const metadata: Metadata = { title: 'Academic years' };

export default function AcademicYearsPage() {
  return <AdminAcademicYears />;
}
