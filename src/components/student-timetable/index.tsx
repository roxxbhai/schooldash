'use client';

import { CalendarClockIcon, RefreshCwIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { PageHeader } from '@/components/page-header';
import { TimetableSkeleton, TimetableWeek } from '@/components/timetable-week';
import { Button } from '@/components/ui/button';
import { loadStudentTimetable } from '@/functions/student-timetable';
import { formatTime, isoWeekday, todayInSchool } from '@/helpers/format';
import { classLabel, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { TimetableEntry } from '@/types/timetable';
import { portalSessionStore } from '@/zustand/portal-session';

/**
 * THE STUDENT'S CLASS TIMETABLE FOR THE CURRENT YEAR, TODAY MARKED. READ-ONLY.
 * NO TEACHER NAMES: STUDENTS CANNOT READ TEACHERS' ACCOUNTS (RLS), SO EACH PERIOD SHOWS SUBJECT, TIME AND ROOM.
 */
export function StudentTimetable() {
  const studentId = portalSessionStore((state) => state.recordId);
  const { classById, subjectById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const yearId = currentAcademicYear?.id ?? null;

  function load() {
    return loadStudentTimetable(studentId ?? '', yearId ?? '');
  }

  const timetable = useAsyncResult(studentId && yearId ? `student-timetable|${studentId}|${yearId}` : null, load);

  const schoolClass = timetable.data?.enrollment ? classById.get(timetable.data.enrollment.classId) : undefined;
  const isLoading = !isReady || (yearId !== null && timetable.isInitialLoading);

  function renderPeriod(entry: TimetableEntry) {
    return (
      <div className='rounded-xl bg-card shadow-xs px-3 py-2'>
        <p className='text-xs text-muted-foreground tabular-nums'>
          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
        </p>
        <p className='mt-0.5 text-sm font-medium text-foreground'>{subjectLabel(subjectById.get(entry.subjectId))}</p>
        {entry.room && <p className='tabular-nums text-xs text-muted-foreground'>Room {entry.room}</p>}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title='My timetable'
        description={schoolClass && currentAcademicYear ? `Class ${classLabel(schoolClass)} · ${currentAcademicYear.name}` : 'Your class’s weekly periods.'}
      />

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
        <EmptyState icon={CalendarClockIcon} title='No current academic year' description="The school office hasn't set the current academic year yet." className='rounded-xl bg-card shadow-xs' />
      ) : timetable.data && !timetable.data.enrollment ? (
        <EmptyState icon={CalendarClockIcon} title='Not in a class yet' description='Your timetable appears once the school office adds you to a class.' className='rounded-xl bg-card shadow-xs' />
      ) : timetable.data && timetable.data.entries.length === 0 ? (
        <EmptyState icon={CalendarClockIcon} title='No periods yet' description="Your class's timetable hasn't been set up yet." className='rounded-xl bg-card shadow-xs' />
      ) : timetable.data ? (
        <TimetableWeek entries={timetable.data.entries} renderPeriod={renderPeriod} today={isoWeekday(todayInSchool())} />
      ) : null}
    </>
  );
}
