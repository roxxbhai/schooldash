import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminExamDetail } from '@/components/admin-exam-detail';

export const metadata: Metadata = { title: 'Exam' };

// THE EXAM ID IS READ IN THE CLIENT COMPONENT (useParams), WHICH NEEDS A SUSPENSE BOUNDARY FOR AN UNKNOWN PARAM.
export default function ExamDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminExamDetail />
    </Suspense>
  );
}
