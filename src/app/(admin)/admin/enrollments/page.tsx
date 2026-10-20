import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminEnrollments } from '@/components/admin-enrollments';

export const metadata: Metadata = { title: 'Enrollments' };

/** useSearchParams (FOR ?studentId=) NEEDS A SUSPENSE BOUNDARY UNDER cacheComponents. */
export default function EnrollmentsPage() {
  return (
    <Suspense>
      <AdminEnrollments />
    </Suspense>
  );
}
