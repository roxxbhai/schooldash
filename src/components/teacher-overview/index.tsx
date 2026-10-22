'use client';

import { CalendarClockIcon, FileTextIcon, MegaphoneIcon, RefreshCwIcon, SchoolIcon } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { PanelLink } from '@/components/panel-link';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { loadTeacherOverview } from '@/functions/teacher-overview';
import { formatDate, formatLongToday, formatTime, pluralize, todayInSchool } from '@/helpers/format';
import { classLabel, sortClasses, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import { portalSessionStore } from '@/zustand/portal-session';

/** THE TEACHER HOME: TODAY'S PERIODS, WHICH CLASSES STILL NEED ATTENDANCE, WHAT THEY TEACH, UPCOMING PAPERS AND NOTICES. ALL REAL DATA. */
export function TeacherOverview() {
  const teacherId = portalSessionStore((state) => state.recordId);

  const { classes, classById, subjectById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const today = todayInSchool();
  const currentYearId = currentAcademicYear?.id ?? null;
  const currentClasses = sortClasses(classes.filter((schoolClass) => schoolClass.academicYearId === currentYearId));
  const currentClassIds = currentClasses.map((schoolClass) => schoolClass.id);

  function load() {
    return loadTeacherOverview({ teacherId: teacherId ?? '', today, currentAcademicYearId: currentYearId, currentClassIds });
  }

  const overview = useAsyncResult(teacherId && isReady ? `teacher-overview|${teacherId}|${today}|${currentClassIds.join(',')}` : null, load);

  const data = overview.data;
  const isLoading = !isReady || !teacherId || overview.isInitialLoading;
  const firstName = data?.teacher.user.fullName.split(' ')[0];

  // WHAT THEY TEACH THIS YEAR, GROUPED BY CLASS; CLASS-TEACHER CLASSES WITHOUT A SUBJECT ASSIGNMENT STILL APPEAR.
  const teaching = currentClasses.map((schoolClass) => ({
    schoolClass,
    isClassTeacher: schoolClass.classTeacherId === teacherId,
    subjects: (data?.assignments ?? [])
      .filter((assignment) => assignment.classId === schoolClass.id)
      .map((assignment) => subjectLabel(subjectById.get(assignment.subjectId)))
      .sort(),
  }));

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : 'Overview'}
        description={
          <span suppressHydrationWarning>
            {formatLongToday()}
            {currentAcademicYear ? ` · Academic year ${currentAcademicYear.name}` : ''}
          </span>
        }
      />

      {(referenceError || overview.errorMessage) && (
        <FormAlert tone='error' title="Your overview couldn't be loaded" className='mb-6'>
          <span>{referenceError ?? overview.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={overview.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      {isReady && !currentAcademicYear && (
        <FormAlert tone='info' title='No current academic year' className='mb-6'>
          The school office hasn&apos;t set the current academic year yet, so there are no classes, periods or exams to show.
        </FormAlert>
      )}

      <div className='grid gap-6 xl:grid-cols-3'>
        <Panel title="Today's periods" description={formatDate(today)} className='xl:col-span-2' bodyClassName='p-0' actions={<PanelLink href={ROUTES.teacher.timetable} label='Timetable' />}>
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : !data || data.periodsToday.length === 0 ? (
            <EmptyState icon={CalendarClockIcon} title='No periods today' description='You have no timetabled periods today.' />
          ) : (
            <ol className='divide-y'>
              {data.periodsToday.map((period) => (
                <li key={period.id} className='flex items-center gap-4 px-5 py-3'>
                  <span className='w-28 shrink-0 text-sm text-foreground tabular-nums'>
                    {formatTime(period.startTime)}–{formatTime(period.endTime)}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block font-medium text-foreground'>{subjectLabel(subjectById.get(period.subjectId))}</span>
                    <span className='block text-sm text-muted-foreground'>{classLabel(classById.get(period.classId))}</span>
                  </span>
                  {period.room && <span className='shrink-0 tabular-nums text-xs text-muted-foreground'>Room {period.room}</span>}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title='Attendance today' description='Classes you teach this year.' bodyClassName='p-0' actions={<PanelLink href={ROUTES.teacher.attendance} label='Mark' />}>
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : currentClasses.length === 0 ? (
            <EmptyState icon={SchoolIcon} title='No classes yet' description='Once the school office assigns you to a class, it appears here.' />
          ) : (
            <ul className='divide-y'>
              {(data?.attendanceToday ?? []).map((entry) => (
                <li key={entry.classId} className='flex items-center justify-between gap-3 px-5 py-3'>
                  <Link href={`${ROUTES.teacher.attendance}?classId=${entry.classId}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
                    {classLabel(classById.get(entry.classId))}
                  </Link>
                  {entry.markedCount === null ? (
                    <span className='text-sm text-muted-foreground'>Couldn&apos;t check</span>
                  ) : entry.markedCount > 0 ? (
                    <StatusBadge tone='success'>{pluralize(entry.markedCount, 'student')} marked</StatusBadge>
                  ) : (
                    <StatusBadge tone='warning'>Not marked yet</StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title='What you teach' description={currentAcademicYear?.name} className='xl:col-span-2' bodyClassName='p-0' actions={<PanelLink href={ROUTES.teacher.classes} label='My classes' />}>
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : teaching.length === 0 ? (
            <EmptyState icon={SchoolIcon} title='No assignments yet' description='The school office assigns teachers to classes and subjects.' />
          ) : (
            <ul className='divide-y'>
              {teaching.map(({ schoolClass, isClassTeacher, subjects }) => (
                <li key={schoolClass.id} className='flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3'>
                  <Link href={`${ROUTES.teacher.classes}/${schoolClass.id}`} className='w-24 shrink-0 font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
                    {classLabel(schoolClass)}
                  </Link>
                  <span className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
                    {subjects.map((subject) => (
                      <StatusBadge key={subject} tone='neutral'>
                        {subject}
                      </StatusBadge>
                    ))}
                    {subjects.length === 0 && <span className='text-sm text-muted-foreground'>No subjects</span>}
                  </span>
                  {isClassTeacher && <StatusBadge tone='brand'>Class teacher</StatusBadge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title='Upcoming papers' description='Exam papers for the subjects you teach.' bodyClassName='p-0' actions={<PanelLink href={ROUTES.teacher.marks} label='Marks' />}>
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : !data || data.upcomingPapers.length === 0 ? (
            <EmptyState icon={FileTextIcon} title='No upcoming papers' description='No dated exam papers for your subjects.' />
          ) : (
            <ul className='divide-y'>
              {data.upcomingPapers.map(({ paper, exam }) => (
                <li key={paper.id} className='px-5 py-3'>
                  <div className='flex items-baseline justify-between gap-3'>
                    <span className='font-medium text-foreground'>{subjectLabel(subjectById.get(paper.subjectId))}</span>
                    <span className='shrink-0 tabular-nums text-xs text-muted-foreground'>{formatDate(paper.examDate)}</span>
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    {exam?.name ?? 'Exam'} · {classLabel(classById.get(paper.classId))} · out of {paper.maxMarks}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title='Latest notices' className='xl:col-span-3' bodyClassName='p-0' actions={<PanelLink href={ROUTES.teacher.notices} label='All notices' />}>
          {isLoading ? (
            <ListSkeleton rows={2} />
          ) : !data || data.notices.length === 0 ? (
            <EmptyState icon={MegaphoneIcon} title='No notices' description='Notices from the school office addressed to you appear here.' />
          ) : (
            <ul className='divide-y'>
              {data.notices.map((notice) => (
                <li key={notice.id} className='px-5 py-3'>
                  <div className='flex items-baseline justify-between gap-3'>
                    <Link href={`${ROUTES.teacher.notices}/${notice.id}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
                      {notice.title}
                    </Link>
                    <span className='shrink-0 tabular-nums text-xs text-muted-foreground'>{formatDate(notice.publishedAt)}</span>
                  </div>
                  <p className='mt-0.5 line-clamp-2 text-sm text-muted-foreground'>{notice.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
