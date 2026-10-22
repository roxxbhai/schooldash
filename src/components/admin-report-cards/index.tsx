'use client';

import { FileTextIcon, PrinterIcon, RefreshCwIcon, UserRoundSearchIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { loadClassRoster } from '@/functions/admin-enrollments';
import { loadYearExams } from '@/functions/admin-exams';
import { loadReportCard } from '@/functions/admin-report-cards';
import { examDatesLabel } from '@/helpers/admin-exams';
import { formatDate, formatMarks, pluralize } from '@/helpers/format';
import { academicYearOptions, classLabel, classOptions } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { ReportCardSubject } from '@/types/report-cards';

/** THE CHOSEN YEAR → EXAM → CLASS → STUDENT. */
interface Selection {
  yearId: string | null;
  examId: string | null;
  classId: string | null;
  studentId: string | null;
}

/**
 * ONE STUDENT'S REPORT CARD FOR ONE EXAM, READY TO PRINT. IT SHOWS ONLY WHAT THE
 * API RETURNS: NO PERCENTAGE, GRADE OR PASS/FAIL (NO RULE FOR THEM IS DEFINED),
 * AND TOTALS ONLY ONCE EVERY SUBJECT HAS A MARK. OPENS FROM ?studentId=&examId=.
 */
export function AdminReportCards() {
  const [selection, setSelection] = useState<Selection | null>(null);

  const searchParams = useSearchParams();
  const linkedStudentId = searchParams.get('studentId');
  const linkedExamId = searchParams.get('examId');
  const { academicYears, classes, academicYearById, currentAcademicYear, isReady } = useReferenceData();

  const isLinked = selection === null && linkedStudentId !== null && linkedExamId !== null;
  const studentId = isLinked ? linkedStudentId : (selection?.studentId ?? null);
  const examId = isLinked ? linkedExamId : (selection?.examId ?? null);
  const cardQuery = useAsyncResult(studentId && examId ? `report-card|${studentId}|${examId}` : null, (signal) =>
    loadReportCard(studentId ?? '', examId ?? '', signal),
  );

  const card = studentId && examId ? cardQuery.data : null;
  const current: Selection =
    selection ??
    (isLinked
      ? { yearId: card?.exam.academicYearId ?? null, examId: linkedExamId, classId: card?.class.id ?? null, studentId: linkedStudentId }
      : { yearId: currentAcademicYear?.id ?? null, examId: null, classId: null, studentId: null });

  const examsQuery = useAsyncResult(current.yearId ? `year-exams|${current.yearId}` : null, () => loadYearExams(current.yearId ?? ''));
  const rosterQuery = useAsyncResult(current.classId ? `class-roster|${current.classId}` : null, () => loadClassRoster(current.classId ?? ''));

  // A LIST STILL SHOWING FROM THE PREVIOUS CHOICE WHILE THE NEXT ONE LOADS IS IGNORED.
  const exams = (examsQuery.data ?? []).filter((exam) => exam.academicYearId === current.yearId);
  const studentChoices = (rosterQuery.data ?? [])
    .filter(({ enrollment }) => enrollment.classId === current.classId)
    .map(({ enrollment, student }) => ({
      value: enrollment.studentId,
      label: `${enrollment.rollNumber ? `${enrollment.rollNumber}. ` : ''}${student?.user.fullName ?? 'Unknown student'}${student ? ` (${student.admissionNumber})` : ''}`,
    }));
  const cardYear = card ? academicYearById.get(card.exam.academicYearId) : undefined;
  const cardDates = card ? examDatesLabel(card.exam) : null;

  const columns: DataTableColumn<ReportCardSubject>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cell: (subject) => (
        <span className='flex flex-col'>
          <span className='font-medium text-foreground'>{subject.subjectName ?? 'Unknown subject'}</span>
          {subject.subjectCode && <span className='font-mono text-xs text-muted-foreground'>{subject.subjectCode}</span>}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Exam date',
      cell: (subject) =>
        subject.examDate ? (
          <span className='font-mono text-sm tabular-nums'>{formatDate(subject.examDate)}</span>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    { key: 'max', header: 'Max', align: 'right', cell: (subject) => <span className='font-mono text-sm tabular-nums'>{formatMarks(subject.maxMarks)}</span> },
    {
      key: 'pass',
      header: 'Pass',
      align: 'right',
      cell: (subject) => <span className='font-mono text-sm tabular-nums'>{formatMarks(subject.passMarks)}</span>,
    },
    {
      key: 'obtained',
      header: 'Obtained',
      align: 'right',
      cell: (subject) =>
        subject.status === 'entered' && subject.marksObtained !== null ? (
          <span className='font-mono text-sm font-semibold text-foreground tabular-nums'>{formatMarks(subject.marksObtained)}</span>
        ) : (
          <span className='text-sm text-muted-foreground'>Not entered</span>
        ),
    },
    { key: 'remarks', header: 'Remarks', cell: (subject) => <span className='text-sm'>{subject.remarks ?? '—'}</span> },
  ];

  function printReport() {
    window.print();
  }

  function renderReport() {
    if (!studentId || !examId) {
      return (
        <div className='border bg-card'>
          <EmptyState icon={UserRoundSearchIcon} title='Choose an exam and a student' description='Pick the academic year, exam, class and student above.' />
        </div>
      );
    }
    if (cardQuery.isLoading) {
      return (
        <div aria-busy className='flex flex-col gap-3 border bg-card p-6'>
          <Skeleton className='h-7 w-64' />
          <Skeleton className='h-5 w-96 max-w-full' />
          <Skeleton className='mt-4 h-48 w-full' />
        </div>
      );
    }
    if (cardQuery.errorMessage) {
      return (
        <FormAlert tone='error' title="Couldn't load the report card">
          <span>{cardQuery.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={cardQuery.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      );
    }
    if (!card) {
      return (
        <div className='border bg-card'>
          <EmptyState
            icon={FileTextIcon}
            title='No report card for this exam'
            description="The student wasn't enrolled in a class during this exam's academic year."
          />
        </div>
      );
    }

    const { summary } = card;
    const isTotalShown = summary.complete && summary.totalMarksObtained !== null && summary.totalMaxMarks !== null;
    return (
      <article aria-label={`Report card of ${card.student.fullName ?? 'student'}`} className='border bg-card shadow-xs print:border-0 print:shadow-none'>
        <header className='grid gap-4 border-b px-6 py-5 sm:grid-cols-2 print:px-0'>
          <div>
            <p className='text-xs font-medium text-muted-foreground uppercase'>Report card</p>
            <h2 className='mt-1 text-2xl font-semibold tracking-tight text-foreground'>{card.student.fullName ?? 'Unknown student'}</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              Admission number <span className='font-mono text-foreground'>{card.student.admissionNumber}</span>
            </p>
          </div>
          <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:justify-self-end'>
            <dt className='text-muted-foreground'>Class</dt>
            <dd className='font-medium text-foreground'>{classLabel(card.class)}</dd>
            <dt className='text-muted-foreground'>Exam</dt>
            <dd className='font-medium text-foreground'>{card.exam.name}</dd>
            <dt className='text-muted-foreground'>Academic year</dt>
            <dd className='text-foreground'>{cardYear?.name ?? '—'}</dd>
            <dt className='text-muted-foreground'>Dates</dt>
            <dd className='font-mono text-foreground tabular-nums'>{cardDates ?? <span className='font-sans text-muted-foreground'>Not set</span>}</dd>
          </dl>
        </header>

        <div className='p-6 print:px-0'>
          {card.scope === 'assignedSubjects' && (
            <FormAlert tone='info' className='mb-4'>
              Only the subjects you teach are shown, so totals are not available.
            </FormAlert>
          )}
          <DataTable
            label={`Subjects of ${card.exam.name}`}
            columns={columns}
            rows={card.subjects}
            getRowKey={(subject) => subject.examSubjectId}
            empty={<EmptyState icon={FileTextIcon} title='No subjects configured' description="This exam has no papers for the student's class yet." />}
          />

          <dl className='mt-5 grid gap-4 border bg-surface-muted p-4 sm:grid-cols-2 print:bg-transparent'>
            <div>
              <dt className='text-sm text-muted-foreground'>Subjects with marks</dt>
              <dd className='mt-0.5 font-mono text-lg font-semibold text-foreground tabular-nums'>
                {summary.subjectsWithMarks} of {summary.subjectsConfigured}
              </dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>Total</dt>
              <dd className='mt-0.5'>
                {isTotalShown ? (
                  <span className='font-mono text-lg font-semibold text-foreground tabular-nums'>
                    {formatMarks(summary.totalMarksObtained)} / {formatMarks(summary.totalMaxMarks)}
                  </span>
                ) : (
                  <span className='text-sm text-muted-foreground'>
                    {summary.subjectsConfigured === 0 ? 'No subjects configured yet.' : 'Totals appear once every subject has a mark.'}
                    {summary.subjectsConfigured > summary.subjectsWithMarks &&
                      ` ${pluralize(summary.subjectsConfigured - summary.subjectsWithMarks, 'subject')} not entered yet.`}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className='print:hidden'>
        <PageHeader
          title='Report cards'
          description='Marks for one student and exam as entered. Percentages, grades and pass/fail are not calculated.'
          actions={
            <Button onClick={printReport} disabled={!card || cardQuery.isLoading}>
              <PrinterIcon aria-hidden />
              Print
            </Button>
          }
        />

        <div className='mb-6 grid gap-4 border bg-card p-5 shadow-xs sm:grid-cols-2 xl:grid-cols-4'>
          <FormField id='report-year' label='Academic year'>
            <OptionSelect
              id='report-year'
              value={current.yearId}
              onValueChange={(value) => setSelection({ yearId: value, examId: null, classId: null, studentId: null })}
              options={academicYearOptions(academicYears)}
              placeholder='Choose a year'
              isDisabled={!isReady}
            />
          </FormField>
          <FormField id='report-exam' label='Exam' error={examsQuery.errorMessage ?? undefined}>
            <OptionSelect
              id='report-exam'
              value={current.examId}
              onValueChange={(value) => setSelection({ ...current, examId: value })}
              options={exams.map((exam) => ({ value: exam.id, label: exam.name }))}
              placeholder={examsQuery.isLoading ? 'Loading exams…' : examsQuery.data && exams.length === 0 ? 'No exams in this year' : 'Choose an exam'}
              isDisabled={!current.yearId || exams.length === 0}
            />
          </FormField>
          <FormField id='report-class' label='Class'>
            <OptionSelect
              id='report-class'
              value={current.classId}
              onValueChange={(value) => setSelection({ ...current, classId: value, studentId: null })}
              options={classOptions(classes, current.yearId)}
              placeholder='Choose a class'
              isDisabled={!isReady || !current.yearId}
            />
          </FormField>
          <FormField id='report-student' label='Student' error={rosterQuery.errorMessage ?? undefined}>
            <OptionSelect
              id='report-student'
              value={current.studentId}
              onValueChange={(value) => setSelection({ ...current, studentId: value })}
              options={studentChoices}
              placeholder={
                rosterQuery.isLoading ? 'Loading students…' : rosterQuery.data && studentChoices.length === 0 ? 'No students in this class' : 'Choose a student'
              }
              isDisabled={!current.classId || studentChoices.length === 0}
            />
          </FormField>
        </div>
      </div>

      {renderReport()}
    </>
  );
}
