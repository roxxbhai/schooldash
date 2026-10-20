'use client';

import { ArrowLeftIcon, ClipboardListIcon, FileTextIcon, PencilIcon, PlusIcon, SquarePenIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PaperFormDialog } from '@/components/admin-exam-detail/paper-form-dialog';
import { ExamFormDialog } from '@/components/admin-exams/exam-form-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ALL_CLASSES } from '@/constants/admin-exam-detail';
import { ROUTES } from '@/constants/routes';
import { loadExamPapers } from '@/functions/admin-exam-detail';
import { loadExam } from '@/functions/admin-exams';
import { examDatesLabel } from '@/helpers/admin-exams';
import { formatDate, formatMarks, pluralize } from '@/helpers/format';
import { classLabel, classOptions, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { ExamSubject } from '@/types/exam-subjects';

/** ONE EXAM: ITS DETAILS AND ITS PAPERS (A SUBJECT FOR A CLASS, WITH MAX AND PASS MARKS). PAPERS ARE NEVER DELETED. */
export function AdminExamDetail() {
  const [classChoice, setClassChoice] = useState<string | null>(null);
  const [isExamFormOpen, setIsExamFormOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState<ExamSubject | null>(null);
  const [isPaperFormOpen, setIsPaperFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const { id } = useParams<{ id: string }>();
  const { classes, classById, subjectById, academicYearById, isReady } = useReferenceData();
  const examQuery = useAsyncResult(`exam|${id}`, (signal) => loadExam(id, signal));
  const papersQuery = useAsyncResult(`exam-papers|${id}`, () => loadExamPapers(id));

  const exam = examQuery.data;
  const year = exam ? academicYearById.get(exam.academicYearId) : undefined;
  const dates = exam ? examDatesLabel(exam) : null;
  const selectedClassId = classChoice === ALL_CLASSES ? null : classChoice;
  const papers = papersQuery.data
    ? papersQuery.data
        .filter((paper) => !selectedClassId || paper.classId === selectedClassId)
        .sort(
          (first, second) =>
            classLabel(classById.get(first.classId)).localeCompare(classLabel(classById.get(second.classId)), 'en', { numeric: true }) ||
            subjectLabel(subjectById.get(first.subjectId)).localeCompare(subjectLabel(subjectById.get(second.subjectId))),
        )
    : null;
  const yearClassCount = exam ? classOptions(classes, exam.academicYearId).length : 0;

  const backLink = (
    <Button asChild variant='link' className='mb-3 h-auto px-0 text-muted-foreground'>
      <Link href={ROUTES.admin.exams}>
        <ArrowLeftIcon aria-hidden />
        All exams
      </Link>
    </Button>
  );

  const columns: DataTableColumn<ExamSubject>[] = [
    { key: 'class', header: 'Class', cell: (paper) => <span className='font-medium text-foreground'>{classLabel(classById.get(paper.classId))}</span> },
    { key: 'subject', header: 'Subject', cell: (paper) => subjectLabel(subjectById.get(paper.subjectId)) },
    { key: 'max', header: 'Max marks', align: 'right', cell: (paper) => <span className='font-mono text-sm tabular-nums'>{formatMarks(paper.maxMarks)}</span> },
    {
      key: 'pass',
      header: 'Pass marks',
      align: 'right',
      className: 'hidden sm:table-cell',
      cell: (paper) => <span className='font-mono text-sm tabular-nums'>{formatMarks(paper.passMarks)}</span>,
    },
    {
      key: 'date',
      header: 'Exam date',
      className: 'hidden md:table-cell',
      cell: (paper) =>
        paper.examDate ? (
          <span className='font-mono text-sm tabular-nums'>{formatDate(paper.examDate)}</span>
        ) : (
          <span className='text-muted-foreground'>Not set</span>
        ),
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (paper) => {
        const paperName = `${subjectLabel(subjectById.get(paper.subjectId))}, ${classLabel(classById.get(paper.classId))}`;
        return (
          <div className='flex justify-end gap-1'>
            <Button variant='ghost' size='sm' onClick={() => openPaperForm(paper)} aria-label={`Edit paper ${paperName}`}>
              <PencilIcon aria-hidden />
              Edit
            </Button>
            <Button asChild variant='outline' size='sm'>
              <Link href={`${ROUTES.admin.results}?examSubjectId=${paper.id}`} aria-label={`Enter marks for ${paperName}`}>
                <SquarePenIcon aria-hidden />
                Enter marks
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];

  function openExamForm() {
    setFormKey((key) => key + 1);
    setIsExamFormOpen(true);
  }

  function openPaperForm(paper: ExamSubject | null) {
    setEditingPaper(paper);
    setFormKey((key) => key + 1);
    setIsPaperFormOpen(true);
  }

  function handleExamSaved() {
    setIsExamFormOpen(false);
    examQuery.reload();
  }

  function handlePaperSaved() {
    setIsPaperFormOpen(false);
    papersQuery.reload();
  }

  if (examQuery.isInitialLoading) {
    return (
      <div aria-busy className='flex flex-col gap-3'>
        {backLink}
        <Skeleton className='h-9 w-72' />
        <Skeleton className='h-5 w-96 max-w-full' />
        <Skeleton className='mt-4 h-64 w-full' />
      </div>
    );
  }

  if (examQuery.errorMessage && !exam) {
    return (
      <>
        {backLink}
        <FormAlert tone='error' title="Couldn't load this exam">
          <span>{examQuery.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={examQuery.reload}>
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!exam) {
    return (
      <>
        {backLink}
        <div className='border bg-card'>
          <EmptyState
            icon={ClipboardListIcon}
            title='Exam not found'
            description='It may have been entered incorrectly. Choose an exam from the list.'
            action={
              <Button asChild>
                <Link href={ROUTES.admin.exams}>Go to exams</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {backLink}
      <PageHeader
        title={exam.name}
        description={
          <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <span>{year?.name ?? 'Unknown academic year'}</span>
            <span aria-hidden>·</span>
            {dates ? <span className='font-mono text-sm tabular-nums'>{dates}</span> : <span>Dates not set</span>}
          </span>
        }
        actions={
          <Button variant='outline' onClick={openExamForm} disabled={!isReady}>
            <PencilIcon aria-hidden />
            Edit exam
          </Button>
        }
      />

      <Panel
        title='Papers'
        description={
          papersQuery.data
            ? `${pluralize(papersQuery.data.length, 'paper')} across all classes. Each paper is one subject for one class.`
            : 'Each paper is one subject for one class.'
        }
        actions={
          <Button onClick={() => openPaperForm(null)} disabled={!isReady || yearClassCount === 0}>
            <PlusIcon aria-hidden />
            Add paper
          </Button>
        }
        bodyClassName='flex flex-col gap-4'
      >
        <div className='w-full sm:w-64'>
          <OptionSelect
            aria-label='Class'
            value={selectedClassId}
            onValueChange={(value) => setClassChoice(value ?? ALL_CLASSES)}
            options={classOptions(classes, exam.academicYearId)}
            placeholder='Class'
            emptyLabel='All classes'
            isDisabled={!isReady}
          />
        </div>
        <DataTable
          label={`Papers of ${exam.name}`}
          columns={columns}
          rows={isReady ? papers : null}
          getRowKey={(paper) => paper.id}
          isLoading={papersQuery.isLoading || !isReady}
          errorMessage={papersQuery.errorMessage}
          onRetry={papersQuery.reload}
          skeletonRows={4}
          empty={
            <EmptyState
              icon={FileTextIcon}
              title={yearClassCount === 0 ? 'No classes in this year' : selectedClassId ? 'No papers for this class' : 'No papers yet'}
              description={
                yearClassCount === 0
                  ? `Create the classes of ${year?.name ?? 'this year'} before adding papers.`
                  : 'Add a paper for each subject a class sits in this exam.'
              }
              action={yearClassCount > 0 ? <Button onClick={() => openPaperForm(null)}>Add paper</Button> : undefined}
            />
          }
        />
      </Panel>

      <ExamFormDialog
        key={`exam-${formKey}`}
        isOpen={isExamFormOpen}
        onOpenChange={setIsExamFormOpen}
        exam={exam}
        defaultYearId={exam.academicYearId}
        onSaved={handleExamSaved}
      />
      <PaperFormDialog
        key={`paper-${formKey}`}
        isOpen={isPaperFormOpen}
        onOpenChange={setIsPaperFormOpen}
        exam={exam}
        paper={editingPaper}
        defaultClassId={selectedClassId}
        onSaved={handlePaperSaved}
      />
    </>
  );
}
