'use client';

import { PageHeader } from '@/components/page-header';
import { ReportCardBrowser } from '@/components/report-card-browser';
import { portalSessionStore } from '@/zustand/portal-session';

/** THE SIGNED-IN STUDENT'S RESULTS, EXAM BY EXAM. READ-ONLY. */
export function StudentResults() {
  const studentId = portalSessionStore((state) => state.recordId);

  return (
    <>
      <PageHeader title='Results' description='Your marks for each exam, as your teachers entered them.' />
      <ReportCardBrowser studentId={studentId} />
    </>
  );
}
