import type { Metadata } from 'next';
import { StudentOverview } from '@/components/student-overview';

export const metadata: Metadata = { title: 'Overview' };

export default function StudentOverviewPage() {
  return <StudentOverview />;
}
