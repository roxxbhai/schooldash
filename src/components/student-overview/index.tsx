'use client';

import { AwardIcon, CalendarClockIcon, MegaphoneIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { PanelLink } from '@/components/panel-link';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { ROUTES } from '@/constants/routes';
import { loadStudentOverview } from '@/functions/student-overview';
import { formatDate, formatLongToday, formatMarks, formatNumber, formatTime, todayInSchool } from '@/helpers/format';
import { classLabel, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import { portalSessionStore } from '@/zustand/portal-session';

/** THE STUDENT HOME: CLASS, TODAY'S PERIODS, THIS YEAR'S ATTENDANCE, THE LATEST RESULT AND NOTICES. ALL REAL DATA, READ-ONLY. */
export function StudentOverview() {
  const studentId = portalSessionStore((state) => state.recordId);

  const { classById, subjectById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const today = todayInSchool();

  function load() {
    return loadStudentOverview({ studentId: studentId ?? '', today, currentAcademicYear });
  }

  const overview = useAsyncResult(studentId && isReady ? `student-overview|${studentId}|${today}|${currentAcademicYear?.id ?? ''}` : null, load);

  const data = overview.data;
  const isLoading = !isReady || !studentId || overview.isInitialLoading;
  const firstName = data?.student.user.fullName.split(' ')[0];
  const schoolClass = data?.enrollment ? classById.get(data.enrollment.classId) : undefined;
  const reportCard = data?.latestReportCard ?? null;

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : 'Overview'}
        description={
          <span suppressHydrationWarning>
            {formatLongToday()}
            {schoolClass ? ` · Class ${classLabel(schoolClass)}` : ''}
            {data?.enrollment?.rollNumber ? ` · Roll number ${data.enrollment.rollNumber}` : ''}
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
          The school office hasn&apos;t set the current academic year yet.
        </FormAlert>
      )}

      {data && currentAcademicYear && !data.enrollment && (
        <FormAlert tone='info' title={`You aren't in a class for ${currentAcademicYear.name} yet`} className='mb-6'>
          Your timetable and results appear once the school office adds you to a class.
        </FormAlert>
      )}

      <div className='grid gap-6 xl:grid-cols-3'>
        <Panel title="Today's periods" description={formatDate(today)} className='xl:col-span-2' bodyClassName='p-0' actions={<PanelLink href={ROUTES.student.timetable} label='Timetable' />}>
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : !data || data.periodsToday.length === 0 ? (
            <EmptyState icon={CalendarClockIcon} title='No periods today' description='Your class has no timetabled periods today.' />
          ) : (
            <ol className='divide-y'>
              {data.periodsToday.map((period) => (
                <li key={period.id} className='flex items-center gap-4 px-5 py-3'>
                  <span className='w-28 shrink-0 text-sm text-foreground tabular-nums'>
                    {formatTime(period.startTime)}–{formatTime(period.endTime)}
                  </span>
                  <span className='min-w-0 flex-1 font-medium text-foreground'>{subjectLabel(subjectById.get(period.subjectId))}</span>
                  {period.room && <span className='shrink-0 tabular-nums text-xs text-muted-foreground'>Room {period.room}</span>}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title='Attendance this year' description={currentAcademicYear?.name} actions={<PanelLink href={ROUTES.student.attendance} label='History' />}>
          {isLoading ? (
            <ListSkeleton rows={2} />
          ) : !data?.attendance ? (
            <p className='text-sm text-muted-foreground'>No attendance to show yet.</p>
          ) : (
            <dl className='grid grid-cols-2 gap-3'>
              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                <div key={option.value} className='rounded-xl bg-surface-muted/70 px-3 py-2.5'>
                  <dt>
                    <StatusBadge tone={option.tone}>{option.label}</StatusBadge>
                  </dt>
                  <dd className='mt-1.5 text-2xl font-semibold text-foreground tabular-nums'>
                    {formatNumber(data.attendance?.[option.value])}
                    <span className='ml-1 text-sm font-normal text-muted-foreground'>{data.attendance?.[option.value] === 1 ? 'day' : 'days'}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <Panel
          title='Latest result'
          description={reportCard ? reportCard.exam.name : undefined}
          className='xl:col-span-2'
          bodyClassName='p-0'
          actions={<PanelLink href={ROUTES.student.results} label='All results' />}
        >
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : !reportCard ? (
            <EmptyState icon={AwardIcon} title='No results yet' description='Marks appear here once your teachers enter them.' />
          ) : (
            <>
              <ul className='divide-y'>
                {reportCard.subjects.map((subject) => (
                  <li key={subject.examSubjectId} className='flex items-center justify-between gap-3 px-5 py-3'>
                    <span className='font-medium text-foreground'>{subject.subjectName ?? subjectLabel(subjectById.get(subject.subjectId))}</span>
                    {subject.status === 'entered' ? (
                      <span className='text-sm text-foreground tabular-nums'>
                        {formatMarks(subject.marksObtained)} <span className='text-muted-foreground'>/ {formatMarks(subject.maxMarks)}</span>
                      </span>
                    ) : (
                      <StatusBadge tone='neutral'>Not entered yet</StatusBadge>
                    )}
                  </li>
                ))}
              </ul>
              <p className='border-t px-5 py-3 text-sm text-muted-foreground'>
                {reportCard.summary.complete && reportCard.summary.totalMarksObtained !== null ? (
                  <>
                    Total{' '}
                    <span className='font-medium text-foreground tabular-nums'>
                      {formatMarks(reportCard.summary.totalMarksObtained)} / {formatMarks(reportCard.summary.totalMaxMarks)}
                    </span>
                  </>
                ) : (
                  `Marks entered for ${reportCard.summary.subjectsWithMarks} of ${reportCard.summary.subjectsConfigured} subjects. The total appears once every subject has a mark.`
                )}
              </p>
            </>
          )}
        </Panel>

        <Panel title='Latest notices' bodyClassName='p-0' actions={<PanelLink href={ROUTES.student.notices} label='All' />}>
          {isLoading ? (
            <ListSkeleton rows={2} />
          ) : !data || data.notices.length === 0 ? (
            <EmptyState icon={MegaphoneIcon} title='No notices' description='Notices from the school appear here.' />
          ) : (
            <ul className='divide-y'>
              {data.notices.map((notice) => (
                <li key={notice.id} className='px-5 py-3'>
                  <Link href={`${ROUTES.student.notices}/${notice.id}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
                    {notice.title}
                  </Link>
                  <p className='tabular-nums text-xs text-muted-foreground'>{formatDate(notice.publishedAt)}</p>
                  <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>{notice.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
