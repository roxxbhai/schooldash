'use client';

import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { loadTodayOverview } from '@/functions/admin-overview';
import { dateBlock, firstName, formatWeekdayDate, greetingFor } from '@/helpers/admin-overview';
import { cn } from '@/helpers/cn';
import { formatNumber, isoWeekday, pluralize, todayInSchool } from '@/helpers/format';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AttentionItem, DoneItem, ExamSnapshot, TodayOverview, UpcomingItem } from '@/types/admin-overview';
import { portalSessionStore } from '@/zustand/portal-session';

interface SectionProps {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A QUIET CARD: A SMALL TITLE ROW, NO DIVIDER UNDER IT. */
function Section({ title, aside, className, children }: SectionProps) {
  return (
    <section className={cn('border bg-card shadow-xs', className)}>
      <div className='flex items-baseline justify-between gap-3 px-5 pt-4 pb-3'>
        <h2 className='text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em] text-foreground'>{title}</h2>
        {aside && <div className='shrink-0 text-xs text-muted-foreground'>{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function AttentionRow({ item, isPrimary }: { item: AttentionItem; isPrimary: boolean }) {
  return (
    <li className='flex items-center gap-3 border-t px-5 py-3'>
      <span aria-hidden className={cn('size-1.5 shrink-0', item.tone === 'warning' ? 'bg-warning' : 'bg-info')} />
      <div className='min-w-0 flex-1'>
        <p className='text-sm leading-snug font-medium text-foreground'>
          <span className='sr-only'>{item.tone === 'warning' ? 'Needs action: ' : 'To review: '}</span>
          {item.title}
        </p>
        <p className='mt-0.5 truncate text-xs text-muted-foreground'>{item.detail}</p>
      </div>
      <Button asChild size='sm' variant={isPrimary ? 'default' : 'outline'} className='shrink-0'>
        <Link href={item.href}>{item.actionLabel}</Link>
      </Button>
    </li>
  );
}

function DoneRow({ item }: { item: DoneItem }) {
  return (
    <li className='flex items-center gap-3 border-t px-5 py-2.5'>
      <CheckIcon aria-hidden className='size-3.5 shrink-0 text-success' strokeWidth={2.5} />
      <div className='min-w-0 flex-1'>
        <p className='text-sm leading-snug text-muted-foreground'>{item.title}</p>
        <p className='truncate text-xs text-muted-foreground/80'>{item.detail}</p>
      </div>
    </li>
  );
}

function AttentionSection({ overview, isLoading }: { overview: TodayOverview | null; isLoading: boolean }) {
  const [isDoneOpen, setIsDoneOpen] = useState(false);

  const attention = overview?.attention ?? [];
  const done = overview?.done ?? [];
  const firstWarningId = attention.find((item) => item.tone === 'warning')?.id;

  function toggleDone() {
    setIsDoneOpen(!isDoneOpen);
  }

  return (
    <Section title='Needs your attention' aside={overview && (attention.length > 0 ? `${attention.length} open` : 'All clear')}>
      {isLoading ? (
        <ul aria-hidden>
          {[0, 1, 2].map((row) => (
            <li key={row} className='flex items-center gap-3 border-t px-5 py-3.5'>
              <Skeleton className='h-9 flex-1' />
              <Skeleton className='h-8 w-24' />
            </li>
          ))}
        </ul>
      ) : attention.length === 0 ? (
        <div className='border-t px-5 py-8 text-center'>
          <p className='text-[0.9375rem] font-medium text-foreground'>You&apos;re all caught up</p>
          <p className='mt-0.5 text-sm text-muted-foreground'>Nothing needs you right now.</p>
        </div>
      ) : (
        <ul>
          {attention.map((item) => (
            <AttentionRow key={item.id} item={item} isPrimary={item.id === firstWarningId} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <button
            type='button'
            onClick={toggleDone}
            aria-expanded={isDoneOpen}
            className='flex w-full items-center gap-1.5 border-t px-5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground'
          >
            <ChevronRightIcon aria-hidden className={cn('size-3 transition-transform duration-200', isDoneOpen && 'rotate-90')} />
            {pluralize(done.length, 'thing')} done
          </button>
          {/* HEIGHT EASES OPEN AND SHUT; A CSS TRANSITION REVERSES FROM WHERE IT IS IF CLICKED AGAIN MID-WAY. */}
          <div className={cn('grid transition-[grid-template-rows] duration-300', isDoneOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <ul className='overflow-hidden' inert={!isDoneOpen}>
              {done.map((item) => (
                <DoneRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        </>
      )}
    </Section>
  );
}

function UpcomingSection({ items, isLoading }: { items: UpcomingItem[]; isLoading: boolean }) {
  return (
    <Section title='Coming up'>
      {isLoading ? (
        <div className='flex flex-col gap-3 px-5 pb-5' aria-hidden>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : items.length === 0 ? (
        <p className='px-5 pb-5 text-sm text-muted-foreground'>
          Nothing scheduled.{' '}
          <Link href={ROUTES.admin.exams} className='font-medium text-primary underline-offset-3 hover:underline'>
            Plan an exam
          </Link>
        </p>
      ) : (
        <ol className='px-2 pb-2'>
          {items.map((item) => {
            const block = dateBlock(item.date);
            return (
              <li key={item.id} className='border-t first:border-t-0'>
                <Link href={item.href} className='grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-muted'>
                  <span className='pt-0.5 text-center leading-none'>
                    <span className='block text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase'>{block.month}</span>
                    <span className='mt-1 block text-lg font-semibold tracking-[-0.02em] text-foreground tabular-nums'>{block.day}</span>
                  </span>
                  <span className='min-w-0'>
                    <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                      <span className='text-sm font-medium text-foreground'>{item.title}</span>
                      {item.tag && <StatusBadge tone={item.tag.tone}>{item.tag.label}</StatusBadge>}
                    </span>
                    <span className='mt-0.5 block truncate text-xs text-muted-foreground'>{item.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function SnapshotSection({ snapshot }: { snapshot: ExamSnapshot }) {
  const belowPass = snapshot.resultCount - snapshot.passedCount;
  const hasFlaggedSubject = snapshot.subjects.some((subject) => subject.belowPassCount > 0);

  return (
    <Section
      className='xl:col-span-2'
      title={
        <>
          {snapshot.examName} results
          {snapshot.classScope && <span className='font-normal text-muted-foreground'> · {snapshot.classScope}</span>}
        </>
      }
      aside={
        <Link
          href={`${ROUTES.admin.reportCards}?examId=${encodeURIComponent(snapshot.examId)}`}
          className='font-medium text-primary underline-offset-3 hover:underline'
        >
          Report cards
        </Link>
      }
    >
      <div className='grid gap-6 px-5 pt-1 pb-5 lg:grid-cols-[11rem_minmax(0,1fr)_14rem] lg:gap-10'>
        <div>
          <p className='text-[2.5rem] leading-none font-semibold tracking-[-0.03em] text-foreground tabular-nums'>
            {snapshot.averagePercent}
            <span className='ml-0.5 text-xl font-medium tracking-normal text-muted-foreground'>%</span>
          </p>
          <p className='mt-2 text-xs text-muted-foreground'>
            {snapshot.classScope ? 'Class average' : 'Average'} across {pluralize(snapshot.subjects.length, 'subject')}
          </p>
          <p className='mt-4 text-sm text-foreground'>
            <span className='font-medium tabular-nums'>
              {formatNumber(snapshot.passedCount)} of {formatNumber(snapshot.resultCount)}
            </span>{' '}
            papers passed
          </p>
          {belowPass > 0 && <p className='mt-0.5 text-xs text-warning'>{pluralize(belowPass, 'paper')} below the pass mark</p>}
        </div>

        <div>
          <ul className='flex flex-col gap-2.5'>
            {snapshot.subjects.map((subject) => (
              <li key={subject.subjectId} className='grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.75rem] items-center gap-3 text-xs'>
                <span className='truncate text-muted-foreground' title={subject.label}>
                  {subject.label}
                </span>
                <span aria-hidden className='relative h-1.5 bg-muted'>
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 bg-primary',
                      subject.belowPassCount > 0 && 'after:absolute after:inset-y-0 after:right-0 after:w-1 after:bg-warning',
                    )}
                    style={{ width: `${Math.min(100, subject.averagePercent)}%` }}
                  />
                </span>
                <span className='text-right font-medium text-foreground tabular-nums'>
                  {subject.averagePercent}%
                  {subject.belowPassCount > 0 && <span className='sr-only'>, {pluralize(subject.belowPassCount, 'student')} below the pass mark</span>}
                </span>
              </li>
            ))}
          </ul>
          {hasFlaggedSubject && (
            <p className='mt-3 flex items-center gap-1.5 text-2xs text-muted-foreground' aria-hidden>
              <span className='h-1.5 w-1 bg-warning' />
              Some students below the pass mark
            </p>
          )}
        </div>

        <div>
          <p className='text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase'>{snapshot.classScope ? 'Top of the class' : 'Top students'}</p>
          <ol className='mt-1.5'>
            {snapshot.topStudents.map((student) => (
              <li key={student.studentId} className='border-t first:border-t-0'>
                <Link
                  href={`${ROUTES.admin.students}/${encodeURIComponent(student.studentId)}`}
                  className='flex items-baseline justify-between gap-3 py-1.5 text-sm text-foreground hover:text-primary'
                >
                  <span className='min-w-0 truncate'>
                    {student.name}
                    {!snapshot.classScope && <span className='text-xs text-muted-foreground'> · {student.classLabel}</span>}
                  </span>
                  <span className='font-medium tabular-nums'>{student.averagePercent}%</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}

function YearCountsStrip({ overview }: { overview: TodayOverview }) {
  const counts = overview.counts;
  const entries = [
    { value: counts.students, singular: 'student', href: ROUTES.admin.students },
    { value: counts.teachers, singular: 'teacher', href: ROUTES.admin.teachers },
    { value: counts.classes, singular: 'class', plural: 'classes', href: ROUTES.admin.classes },
    { value: counts.subjects, singular: 'subject', href: ROUTES.admin.subjects },
    { value: counts.exams, singular: 'exam', href: ROUTES.admin.exams },
    { value: counts.liveNotices, singular: 'notice', plural: 'notices', suffix: ' live', href: ROUTES.admin.notices },
  ];

  return (
    <nav aria-label='This year' className='flex flex-wrap gap-x-6 gap-y-2 border bg-card px-5 py-3.5 text-sm shadow-xs xl:col-span-2'>
      {entries.map((entry) => (
        <Link key={entry.href} href={entry.href} className='text-muted-foreground transition-colors hover:text-primary'>
          <span className='font-semibold text-foreground tabular-nums'>{entry.value === null ? '—' : formatNumber(entry.value)}</span>{' '}
          {entry.value === 1 ? entry.singular : (entry.plural ?? `${entry.singular}s`)}
          {entry.suffix}
        </Link>
      ))}
    </nav>
  );
}

/**
 * THE ADMIN HOME, "TODAY": WHAT NEEDS AN ADMIN NOW (EACH WITH THE ONE ACTION
 * THAT RESOLVES IT), WHAT'S ALREADY DONE, WHAT'S COMING UP AND HOW THE LATEST
 * EXAM WENT. EVERY FIGURE IS REAL; NOTHING IS ESTIMATED OR SAMPLE DATA.
 */
export function AdminOverview() {
  const fullName = portalSessionStore((state) => state.fullName);

  const { classes, subjects, currentAcademicYear, classById, subjectById, teacherById, isReady, errorMessage: referenceError } = useReferenceData();

  const today = todayInSchool();
  const yearId = currentAcademicYear?.id ?? null;
  const yearClasses = yearId ? classes.filter((schoolClass) => schoolClass.academicYearId === yearId) : [];
  const name = firstName(fullName);

  function load() {
    return loadTodayOverview({
      today,
      dayOfWeek: isoWeekday(today),
      year: currentAcademicYear,
      classes: yearClasses,
      subjects,
      classById,
      subjectById,
      teacherById,
    });
  }

  const overview = useAsyncResult(isReady ? `today|${today}|${yearId}|${yearClasses.length}|${subjects.length}` : null, load);

  const data = overview.data;
  const isLoading = !isReady || overview.isInitialLoading;
  const openCount = data?.attention.length ?? 0;

  return (
    <>
      <header className='mb-7'>
        <p className='text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase' suppressHydrationWarning>
          {formatWeekdayDate()}
        </p>
        <h1 className='mt-1.5 text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.022em] text-foreground' suppressHydrationWarning>
          {greetingFor()}
          {name && `, ${name}`}
        </h1>
        <div className='mt-2 min-h-6 text-[0.9375rem] text-muted-foreground' aria-live='polite'>
          {isLoading ? (
            <Skeleton className='h-5 w-64' />
          ) : !data ? null : openCount === 0 ? (
            <p>
              <span className='font-medium text-foreground'>You&apos;re all caught up.</span> Nothing needs you right now.
            </p>
          ) : (
            <p>
              <span className='font-medium text-foreground'>
                {openCount} {openCount === 1 ? 'thing needs' : 'things need'} your attention.
              </span>{' '}
              {data.done.length > 0 && `${pluralize(data.done.length, 'thing')} already done.`}
            </p>
          )}
        </div>
      </header>

      {(referenceError || overview.errorMessage) && (
        <FormAlert tone='error' title="Some of today's figures couldn't be loaded" className='mb-6'>
          {referenceError ?? overview.errorMessage}
        </FormAlert>
      )}

      <div className='grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]'>
        <AttentionSection overview={data} isLoading={isLoading} />
        <UpcomingSection items={data?.upcoming ?? []} isLoading={isLoading} />
        {data?.snapshot && <SnapshotSection snapshot={data.snapshot} />}
        {data && <YearCountsStrip overview={data} />}
      </div>
    </>
  );
}
