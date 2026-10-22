'use client';

import { CalendarClockIcon, RefreshCwIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { PageHeader } from '@/components/page-header';
import { TimetableSkeleton, TimetableWeek } from '@/components/timetable-week';
import { Button } from '@/components/ui/button';
import { loadTeacherTimetable } from '@/functions/teacher-timetable';
import { formatTime, isoWeekday, todayInSchool } from '@/helpers/format';
import { classLabel, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { TimetableEntry } from '@/types/timetable';
import { portalSessionStore } from '@/zustand/portal-session';

/** THE TEACHER'S OWN WEEKLY PERIODS FOR THE CURRENT YEAR, TODAY MARKED. READ-ONLY: THE SCHOOL OFFICE SETS THE TIMETABLE. */
export function TeacherTimetable() {
  const teacherId = portalSessionStore((state) => state.recordId);
  const { classById, subjectById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const yearId = currentAcademicYear?.id ?? null;

  function load() {
    return loadTeacherTimetable(teacherId ?? '', yearId ?? '');
  }

  const timetable = useAsyncResult(teacherId && yearId ? `teacher-timetable|${teacherId}|${yearId}` : null, load);

  const isLoading = !isReady || !teacherId || (yearId !== null && timetable.isInitialLoading);

  function renderPeriod(entry: TimetableEntry) {
    return (
      <div className='border bg-card px-3 py-2'>
        <p className='text-xs text-muted-foreground tabular-nums'>
          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
        </p>
        <p className='mt-0.5 text-sm font-medium text-foreground'>{subjectLabel(subjectById.get(entry.subjectId))}</p>
        <p className='text-xs text-muted-foreground'>
          {classLabel(classById.get(entry.classId))}
          {entry.room && <span className='tabular-nums'> · Room {entry.room}</span>}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title='Timetable' description={currentAcademicYear ? `Your periods in ${currentAcademicYear.name}.` : 'Your weekly periods.'} />

      {(timetable.errorMessage || referenceError) && (
        <FormAlert tone='error' title="Your timetable couldn't be loaded" className='mb-6'>
          <span>{timetable.errorMessage ?? referenceError}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={timetable.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      {isLoading ? (
        <TimetableSkeleton />
      ) : !yearId ? (
        <EmptyState icon={CalendarClockIcon} title='No current academic year' description="The school office hasn't set the current academic year yet." className='border bg-card shadow-xs' />
      ) : timetable.data && timetable.data.length === 0 ? (
        <EmptyState icon={CalendarClockIcon} title='No periods yet' description='The school office hasn’t timetabled any periods for you.' className='border bg-card shadow-xs' />
      ) : timetable.data ? (
        <TimetableWeek entries={timetable.data} renderPeriod={renderPeriod} today={isoWeekday(todayInSchool())} />
      ) : null}
    </>
  );
}
