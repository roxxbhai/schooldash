'use client';

import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  PenLineIcon,
  SchoolIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { loadOverviewMetrics } from '@/functions/admin-overview';
import { cn } from '@/helpers/cn';
import { formatDate, formatNumber, pluralize, todayInSchool, weekdayLabel } from '@/helpers/format';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { OverviewMetrics } from '@/types/admin-overview';

const QUICK_ACTIONS = [
  { label: 'Mark student attendance', href: ROUTES.admin.studentAttendance, icon: CalendarCheckIcon },
  { label: 'Enter marks', href: ROUTES.admin.results, icon: PenLineIcon },
  { label: 'Add a student', href: ROUTES.admin.students, icon: UserPlusIcon },
  { label: 'Draft a notice', href: ROUTES.admin.notices, icon: MegaphoneIcon },
] as const;

/** ISO WEEKDAY (1 = MONDAY) OF A "YYYY-MM-DD" DATE. */
function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

interface AttendanceRowProps {
  label: string;
  value: number | null;
  total: number | null;
  barClassName: string;
}

function AttendanceRow({ label, value, total, barClassName }: AttendanceRowProps) {
  const share = value !== null && total ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className='flex items-baseline justify-between text-sm'>
        <span className='text-muted-foreground'>{label}</span>
        <span className='font-medium text-foreground tabular-nums'>{formatNumber(value)}</span>
      </div>
      <div className='mt-1.5 h-1.5 bg-muted' aria-hidden>
        <div className={cn('h-full', barClassName)} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function AttendanceToday({ metrics }: { metrics: OverviewMetrics }) {
  const students = metrics.studentAttendance;
  const teachers = metrics.teacherAttendance;
  const hasStudentRecords = (students.marked ?? 0) > 0;

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      <div>
        <div className='flex items-baseline justify-between'>
          <h3 className='text-base font-medium text-foreground'>Students</h3>
          <span className='text-sm text-muted-foreground'>{students.marked === null ? '—' : `${pluralize(students.marked, 'record')} marked`}</span>
        </div>
        {hasStudentRecords ? (
          <div className='mt-4 flex flex-col gap-3'>
            <AttendanceRow label='Present' value={students.present} total={students.marked} barClassName='bg-success' />
            <AttendanceRow label='Late' value={students.late} total={students.marked} barClassName='bg-brand-gold' />
            <AttendanceRow label='Absent' value={students.absent} total={students.marked} barClassName='bg-destructive' />
            <AttendanceRow label='On leave' value={students.leave} total={students.marked} barClassName='bg-info' />
          </div>
        ) : (
          <p className='mt-4 text-sm text-muted-foreground'>No student attendance has been marked today yet.</p>
        )}
      </div>
      <div>
        <div className='flex items-baseline justify-between'>
          <h3 className='text-base font-medium text-foreground'>Teachers</h3>
          <span className='text-sm text-muted-foreground'>{teachers.marked === null ? '—' : `${pluralize(teachers.marked, 'record')} marked`}</span>
        </div>
        {(teachers.marked ?? 0) > 0 ? (
          <div className='mt-4 flex flex-col gap-3'>
            <AttendanceRow label='Present' value={teachers.present} total={teachers.marked} barClassName='bg-success' />
            <AttendanceRow label='Absent' value={teachers.absent} total={teachers.marked} barClassName='bg-destructive' />
          </div>
        ) : (
          <p className='mt-4 text-sm text-muted-foreground'>No teacher attendance has been marked today yet.</p>
        )}
      </div>
    </div>
  );
}

/** THE ADMIN HOME: REAL COUNTS FOR TODAY AND THE CURRENT YEAR, AND SHORTCUTS TO DAILY TASKS. NOTHING HERE IS ESTIMATED OR SAMPLE DATA. */
export function AdminOverview() {
  const { classes, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const today = todayInSchool();
  const dayOfWeek = isoWeekday(today);
  const currentYearId = currentAcademicYear?.id ?? null;
  const classesThisYear = currentYearId ? classes.filter((schoolClass) => schoolClass.academicYearId === currentYearId).length : null;

  function load() {
    return loadOverviewMetrics({ today, dayOfWeek, currentAcademicYearId: currentYearId });
  }

  const overview = useAsyncResult(isReady ? `overview|${today}|${currentYearId}` : null, load);

  const metrics = overview.data;
  const isLoading = !isReady || overview.isInitialLoading;
  const upcomingExams = (metrics?.exams ?? [])
    .filter((exam) => !exam.endDate || exam.endDate >= today)
    .sort((first, second) => (first.startDate ?? '9999').localeCompare(second.startDate ?? '9999'))
    .slice(0, 4);

  return (
    <>
      <PageHeader
        title='Dashboard'
        description={currentAcademicYear ? `Academic year ${currentAcademicYear.name}.` : 'Today at the school, at a glance.'}
      />

      {(referenceError || overview.errorMessage) && (
        <FormAlert tone='error' title="Some figures couldn't be loaded" className='mb-6'>
          {referenceError ?? overview.errorMessage}
        </FormAlert>
      )}

      {isReady && !currentAcademicYear && (
        <FormAlert tone='info' title='No current academic year' className='mb-6'>
          Classes, enrollments, exams and the timetable all belong to an academic year.{' '}
          <Link href={ROUTES.admin.academicYears} className='font-medium text-primary underline underline-offset-3'>
            Create one and mark it as current
          </Link>{' '}
          to get started.
        </FormAlert>
      )}

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          label='Active students'
          value={metrics ? formatNumber(metrics.activeStudents) : null}
          icon={GraduationCapIcon}
          href={ROUTES.admin.students}
          isLoading={isLoading}
        />
        <MetricCard
          label='Active teachers'
          value={metrics ? formatNumber(metrics.activeTeachers) : null}
          icon={UsersIcon}
          tone='info'
          href={ROUTES.admin.teachers}
          isLoading={isLoading}
        />
        <MetricCard
          label='Classes this year'
          value={classesThisYear === null ? null : formatNumber(classesThisYear)}
          detail={isReady ? (currentAcademicYear?.name ?? 'No current academic year') : undefined}
          icon={SchoolIcon}
          tone='success'
          href={ROUTES.admin.classes}
          isLoading={!isReady}
        />
        <MetricCard
          label='Published notices'
          value={metrics ? formatNumber(metrics.publishedNotices) : null}
          detail={metrics && metrics.draftNotices !== null ? `${pluralize(metrics.draftNotices, 'draft')} waiting` : undefined}
          icon={MegaphoneIcon}
          tone='warning'
          href={ROUTES.admin.notices}
          isLoading={isLoading}
        />
      </div>

      <div className='mt-6 grid gap-6 xl:grid-cols-3'>
        <Panel
          title='Attendance today'
          description={formatDate(today)}
          className='xl:col-span-2'
          actions={
            <Button asChild variant='outline' size='sm'>
              <Link href={ROUTES.admin.studentAttendance}>
                Mark attendance
                <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          }
        >
          {isLoading || !metrics ? <Skeleton className='h-36 w-full' /> : <AttendanceToday metrics={metrics} />}
        </Panel>

        <Panel title='Quick actions'>
          <ul className='-my-1 flex flex-col'>
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.href}>
                  <Link
                    href={action.href}
                    className='group flex items-center gap-3 border-b py-3 text-base text-foreground transition-colors last:border-b-0 hover:text-primary'
                  >
                    <span aria-hidden className='flex size-8 items-center justify-center bg-secondary text-primary'>
                      <Icon className='size-4' />
                    </span>
                    <span className='flex-1'>{action.label}</span>
                    <ArrowRightIcon aria-hidden className='size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className='mt-6 grid gap-6 xl:grid-cols-3'>
        <Panel
          title='Upcoming exams'
          description={currentAcademicYear ? `In ${currentAcademicYear.name}` : undefined}
          className='xl:col-span-2'
          bodyClassName='p-0'
          actions={
            <Button asChild variant='ghost' size='sm'>
              <Link href={ROUTES.admin.exams}>All exams</Link>
            </Button>
          }
        >
          {isLoading ? (
            <div className='p-5'>
              <Skeleton className='h-24 w-full' />
            </div>
          ) : upcomingExams.length === 0 ? (
            <EmptyState
              icon={FileTextIcon}
              title='No upcoming exams'
              description={currentAcademicYear ? 'Exams you create for the current year will appear here.' : 'Set a current academic year first.'}
            />
          ) : (
            <ul>
              {upcomingExams.map((exam) => (
                <li key={exam.id} className='flex items-center justify-between gap-4 border-b px-5 py-3.5 last:border-b-0'>
                  <Link href={`${ROUTES.admin.exams}/${exam.id}`} className='font-medium text-foreground hover:text-primary hover:underline'>
                    {exam.name}
                  </Link>
                  <span className='font-mono text-sm text-muted-foreground'>
                    {exam.startDate ? `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}` : 'Dates not set'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title='Timetable today'>
          {isLoading ? (
            <Skeleton className='h-16 w-full' />
          ) : (
            <div className='flex items-start gap-3'>
              <span aria-hidden className='flex size-10 shrink-0 items-center justify-center bg-secondary text-primary'>
                <CalendarClockIcon className='size-5' />
              </span>
              {metrics?.periodsToday === null || metrics?.periodsToday === undefined ? (
                <p className='text-sm text-muted-foreground'>Set a current academic year to see today&apos;s periods.</p>
              ) : (
                <div>
                  <p className='text-3xl font-semibold tracking-tight tabular-nums'>{formatNumber(metrics.periodsToday)}</p>
                  <p className='text-sm text-muted-foreground'>
                    {metrics.periodsToday === 1 ? 'period' : 'periods'} scheduled for {weekdayLabel(dayOfWeek)} across all classes.
                  </p>
                  {metrics.periodsToday === 0 && (
                    <StatusBadge tone='neutral' className='mt-2'>
                      No periods today
                    </StatusBadge>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
