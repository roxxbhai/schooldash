'use client';

import { AwardIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { loadReportCard, loadStudentEnrollments, loadStudentExams } from '@/functions/student-results';
import { formatDate, formatMarks, todayInSchool } from '@/helpers/format';
import { classLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { ReportCardSubject } from '@/types/report-cards';

interface ReportCardBrowserProps {
  /** THE STUDENT WHOSE CARDS TO SHOW: THE SIGNED-IN STUDENT, OR A STUDENT THE SIGNED-IN TEACHER TEACHES. */
  studentId: string | null;
}

/**
 * CHOOSE A YEAR AND AN EXAM, SEE ITS REPORT CARD AS THE SERVER BUILDS IT. READ-ONLY.
 * THE SERVER DECIDES WHAT IS VISIBLE: A STUDENT GETS THEIR WHOLE CARD; A TEACHER ONLY
 * THE SUBJECTS THEY TEACH, WITHOUT TOTALS (`scope: 'assignedSubjects'`). MARKS SHOW AS
 * SOON AS THEY ARE ENTERED (NO PUBLICATION STEP). NO PERCENTAGE, GRADE OR PASS/FAIL:
 * THE SCHOOL HAS DEFINED NO RULES FOR THEM; A TOTAL APPEARS ONLY ONCE EVERY SUBJECT HAS A MARK.
 */
export function ReportCardBrowser({ studentId }: ReportCardBrowserProps) {
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [examChoice, setExamChoice] = useState<string | null>(null);

  const { academicYearById, classById, currentAcademicYear } = useReferenceData();

  function loadEnrollments() {
    return loadStudentEnrollments(studentId ?? '');
  }

  const enrollments = useAsyncResult(studentId ? `student-enrollments|${studentId}` : null, loadEnrollments);

  const enrolledYears = (enrollments.data ?? [])
    .map((enrollment) => ({ enrollment, year: academicYearById.get(enrollment.academicYearId) }))
    .sort((first, second) => (second.year?.startDate ?? '').localeCompare(first.year?.startDate ?? ''));
  // UNTIL CHOSEN: THE CURRENT YEAR IF ENROLLED IN IT, ELSE THE MOST RECENT ONE.
  const selected =
    enrolledYears.find((entry) => entry.enrollment.academicYearId === yearChoice) ??
    enrolledYears.find((entry) => entry.enrollment.academicYearId === currentAcademicYear?.id) ??
    enrolledYears[0] ??
    null;
  const enrollment = selected?.enrollment ?? null;

  function loadExams() {
    return loadStudentExams(enrollment?.classId ?? '', enrollment?.academicYearId ?? '');
  }

  const exams = useAsyncResult(enrollment ? `student-exams|${enrollment.id}` : null, loadExams);
  const today = todayInSchool();
  // UNTIL CHOSEN: THE MOST RECENT EXAM THAT HAS STARTED (THE ONE MOST LIKELY TO HAVE MARKS), ELSE THE NEWEST.
  const examId =
    exams.data?.find((exam) => exam.id === examChoice)?.id ??
    exams.data?.find((exam) => exam.startDate !== null && exam.startDate <= today)?.id ??
    exams.data?.[0]?.id ??
    null;

  function loadCard(signal: AbortSignal) {
    return loadReportCard(studentId ?? '', examId ?? '', signal);
  }

  const card = useAsyncResult(studentId && examId ? `report-card|${studentId}|${examId}` : null, loadCard);
  const reportCard = card.data;

  const yearOptions = enrolledYears.map(({ enrollment: entry, year }) => ({
    value: entry.academicYearId,
    label: `${year?.name ?? 'Academic year'} · ${classLabel(classById.get(entry.classId))}`,
  }));
  const examOptions = (exams.data ?? []).map((exam) => ({ value: exam.id, label: exam.name }));

  function handleYearChange(value: string | null) {
    setYearChoice(value);
    setExamChoice(null);
  }

  const columns: DataTableColumn<ReportCardSubject>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cell: (subject) => (
        <span className='flex flex-col'>
          <span className='font-medium text-foreground'>{subject.subjectName ?? '—'}</span>
          {subject.subjectCode && <span className='tabular-nums text-xs text-muted-foreground'>{subject.subjectCode}</span>}
        </span>
      ),
    },
    { key: 'date', header: 'Exam date', className: 'hidden sm:table-cell', cell: (subject) => <span className='tabular-nums text-sm'>{formatDate(subject.examDate)}</span> },
    {
      key: 'marks',
      header: 'Marks',
      align: 'right',
      cell: (subject) =>
        subject.status === 'entered' ? (
          <span className='text-sm text-foreground tabular-nums'>
            {formatMarks(subject.marksObtained)} <span className='text-muted-foreground'>/ {formatMarks(subject.maxMarks)}</span>
          </span>
        ) : (
          <StatusBadge tone='neutral'>Not entered yet</StatusBadge>
        ),
    },
    {
      key: 'pass',
      header: 'Pass marks',
      align: 'right',
      className: 'hidden md:table-cell',
      cell: (subject) => <span className='tabular-nums text-sm text-muted-foreground'>{subject.passMarks === null ? '—' : formatMarks(subject.passMarks)}</span>,
    },
    { key: 'remarks', header: 'Remarks', className: 'hidden lg:table-cell', cell: (subject) => <span className='text-sm text-muted-foreground'>{subject.remarks ?? '—'}</span> },
  ];

  const loadError = enrollments.errorMessage ?? exams.errorMessage;
  const hasNoClass = enrollments.data !== null && enrollments.data.length === 0;
  const hasNoExams = exams.data !== null && exams.data.length === 0;

  return (
    <>
      {loadError && (
        <FormAlert tone='error' title="Results couldn't be loaded" className='mb-6'>
          <span>{loadError}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={enrollments.errorMessage ? enrollments.reload : exams.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      {hasNoClass ? (
        <EmptyState icon={AwardIcon} title='No results yet' description='Results appear once the student is in a class.' className='rounded-xl bg-card shadow-xs' />
      ) : (
        <>
          <div className='mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl'>
            <FormField id='results-year' label='Academic year'>
              <OptionSelect
                id='results-year'
                value={enrollment?.academicYearId ?? null}
                onValueChange={handleYearChange}
                options={yearOptions}
                placeholder='Choose a year'
                isDisabled={yearOptions.length === 0}
              />
            </FormField>
            <FormField id='results-exam' label='Exam'>
              <OptionSelect id='results-exam' value={examId} onValueChange={setExamChoice} options={examOptions} placeholder='Choose an exam' isDisabled={examOptions.length === 0} />
            </FormField>
          </div>

          {hasNoExams ? (
            <EmptyState icon={AwardIcon} title='No exams yet' description='No exams have been set for this class and year.' className='rounded-xl bg-card shadow-xs' />
          ) : (
            <DataTable
              label={reportCard ? `${reportCard.exam.name} report card` : 'Report card'}
              columns={columns}
              rows={reportCard?.subjects ?? null}
              getRowKey={(subject) => subject.examSubjectId}
              isLoading={card.isLoading || exams.isLoading || enrollments.isLoading}
              errorMessage={card.errorMessage}
              onRetry={card.reload}
              empty={<EmptyState icon={AwardIcon} title='No papers' description='No papers of this exam are visible here.' />}
              footer={
                reportCard && (
                  <div className='flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm'>
                    <span className='text-muted-foreground'>
                      {reportCard.exam.startDate ? `${formatDate(reportCard.exam.startDate)} – ${formatDate(reportCard.exam.endDate)} · ` : ''}
                      Class {reportCard.class.name} – {reportCard.class.section}
                    </span>
                    {reportCard.scope === 'assignedSubjects' ? (
                      <span className='text-muted-foreground'>Only the subjects you teach are shown, so there is no total.</span>
                    ) : reportCard.summary.complete && reportCard.summary.totalMarksObtained !== null ? (
                      <span className='text-foreground'>
                        Total{' '}
                        <span className='font-semibold tabular-nums'>
                          {formatMarks(reportCard.summary.totalMarksObtained)} / {formatMarks(reportCard.summary.totalMaxMarks)}
                        </span>
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>
                        Marks entered for {reportCard.summary.subjectsWithMarks} of {reportCard.summary.subjectsConfigured} subjects. The total appears once every subject has a mark.
                      </span>
                    )}
                  </div>
                )
              }
            />
          )}
        </>
      )}
    </>
  );
}
