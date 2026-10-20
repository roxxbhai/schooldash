import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminResults } from '@/components/admin-results';

export const metadata: Metadata = { title: 'Marks entry' };

// THE COMPONENT READS ?examSubjectId= (useSearchParams), WHICH NEEDS A SUSPENSE BOUNDARY.
export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <AdminResults />
    </Suspense>
  );
}
