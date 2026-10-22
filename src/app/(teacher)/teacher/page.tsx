import type { Metadata } from 'next';
import { TeacherOverview } from '@/components/teacher-overview';

export const metadata: Metadata = { title: 'Overview' };

export default function TeacherOverviewPage() {
  return <TeacherOverview />;
}
