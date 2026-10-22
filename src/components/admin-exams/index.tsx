'use client';

import { ClipboardListIcon, PencilIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ExamFormDialog } from '@/components/admin-exams/exam-form-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { Button } from '@/components/ui/button';
import { ALL_YEARS } from '@/constants/admin-exams';
import { API_PATHS } from '@/constants/api-client';
import { ROUTES } from '@/constants/routes';
import { examDatesLabel } from '@/helpers/admin-exams';
import { academicYearOptions } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { Exam } from '@/types/exams';

/** EXAMS PER ACADEMIC YEAR: LIST, CREATE AND EDIT. PAPERS ARE SET UP ON EACH EXAM'S PAGE. EXAMS ARE NEVER DELETED. */
export function AdminExams() {
  const [page, setPage] = useState(1);
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const { academicYears, academicYearById, currentAcademicYear, isReady } = useReferenceData();

  const selectedYearId = yearChoice === ALL_YEARS ? null : (yearChoice ?? currentAcademicYear?.id ?? null);
  const list = useApiQuery<PaginatedList<Exam>>(isReady ? API_PATHS.exams : null, { page, limit: 20, academicYearId: selectedYearId });

  const columns: DataTableColumn<Exam>[] = [
    {
      key: 'name',
      header: 'Exam',
      cell: (exam) => (
        <Link
          href={`${ROUTES.admin.exams}/${exam.id}`}
          className='font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
        >
          {exam.name}
        </Link>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      cell: (exam) => {
        const label = examDatesLabel(exam);
        return label ? <span className='text-sm tabular-nums'>{label}</span> : <span className='text-muted-foreground'>Dates not set</span>;
      },
    },
    {
      key: 'year',
      header: 'Academic year',
      className: 'hidden md:table-cell',
      cell: (exam) => academicYearById.get(exam.academicYearId)?.name ?? '—',
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (exam) => (
        <Button variant='ghost' size='sm' onClick={() => openForm(exam)} aria-label={`Edit ${exam.name}`}>
          <PencilIcon aria-hidden />
          Edit
        </Button>
      ),
    },
  ];

  function handleYearChange(value: string | null) {
    setYearChoice(value ?? ALL_YEARS);
    setPage(1);
  }

  function openForm(exam: Exam | null) {
    setEditing(exam);
    setFormKey((key) => key + 1);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    list.reload();
  }

  return (
    <>
      <PageHeader
        title='Exams'
        description='Each exam belongs to one academic year. Open an exam to set up its papers for each class.'
        actions={
          <Button onClick={() => openForm(null)} disabled={!isReady || academicYears.length === 0}>
            <PlusIcon aria-hidden />
            New exam
          </Button>
        }
      />

      <div className='mb-4 w-full sm:w-64'>
        <OptionSelect
          aria-label='Academic year'
          value={selectedYearId}
          onValueChange={handleYearChange}
          options={academicYearOptions(academicYears)}
          placeholder='Academic year'
          emptyLabel='All years'
          isDisabled={!isReady}
        />
      </div>

      <DataTable
        label='Exams'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(exam) => exam.id}
        isLoading={list.isLoading || !isReady}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          <EmptyState
            icon={ClipboardListIcon}
            title={academicYears.length === 0 ? 'Create an academic year first' : 'No exams in this year'}
            description={academicYears.length === 0 ? 'Every exam belongs to an academic year.' : 'Create an exam, then add its papers for each class.'}
            action={academicYears.length > 0 ? <Button onClick={() => openForm(null)}>New exam</Button> : undefined}
          />
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='exams' />}
      />

      <ExamFormDialog
        key={formKey}
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        exam={editing}
        defaultYearId={selectedYearId ?? currentAcademicYear?.id ?? null}
        onSaved={handleSaved}
      />
    </>
  );
}
