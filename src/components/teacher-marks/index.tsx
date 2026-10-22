'use client';

import { RefreshCwIcon } from 'lucide-react';
import { AdminResults } from '@/components/admin-results';
import { FormAlert } from '@/components/form-alert';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { loadTeacherAssignments } from '@/functions/teacher-classes';
import { useAsyncResult } from '@/hooks/use-async-result';
import type { ExamSubject } from '@/types/exam-subjects';
import { portalSessionStore } from '@/zustand/portal-session';

/**
 * MARKS ENTRY FOR THE TEACHER: THE SHARED MARKS SHEET, LIMITED TO PAPERS WHOSE CLASS
 * AND SUBJECT THEY ARE ASSIGNED. THE API APPLIES THE SAME RULE TO EVERY SAVE.
 */
export function TeacherMarks() {
  const teacherId = portalSessionStore((state) => state.recordId);

  const assignments = useAsyncResult(teacherId ? `teacher-assignments|${teacherId}` : null, loadTeacherAssignments);

  const taught = new Set((assignments.data ?? []).map((assignment) => `${assignment.classId}|${assignment.subjectId}`));

  function canEnterPaper(paper: ExamSubject) {
    return taught.has(`${paper.classId}|${paper.subjectId}`);
  }

  if (assignments.errorMessage) {
    return (
      <>
        <PageHeader title='Marks entry' />
        <FormAlert tone='error' title="Your subjects couldn't be loaded">
          <span>{assignments.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={assignments.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!assignments.data) {
    return (
      <>
        <PageHeader title='Marks entry' />
        <Skeleton className='h-40 w-full' />
      </>
    );
  }

  return <AdminResults role='TEACHER' canEnterPaper={canEnterPaper} />;
}
