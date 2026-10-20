import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminReportCards } from '@/components/admin-report-cards';

export const metadata: Metadata = { title: 'Report cards' };

// THE COMPONENT READS ?studentId=&examId= (useSearchParams), WHICH NEEDS A SUSPENSE BOUNDARY.
export default function ReportCardsPage() {
  return (
    <Suspense fallback={null}>
      <AdminReportCards />
    </Suspense>
  );
}
