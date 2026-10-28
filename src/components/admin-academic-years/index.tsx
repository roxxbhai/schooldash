'use client';

import { CalendarRangeIcon, PencilIcon, PlusIcon, StarIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACADEMIC_YEAR_FORM_SCHEMA, EMPTY_ACADEMIC_YEAR_FORM, type AcademicYearForm } from '@/constants/admin-academic-years';
import { API_PATHS } from '@/constants/api-client';
import { createAcademicYear, setCurrentAcademicYear, updateAcademicYear } from '@/functions/admin-academic-years';
import { refreshReferenceData } from '@/functions/reference-data';
import { suggestNextAcademicYear } from '@/helpers/admin-academic-years';
import { formatDate, todayInSchool } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AcademicYear } from '@/types/academic-years';
import type { PaginatedList } from '@/types/api';

/** ACADEMIC YEARS: LIST, CREATE, EDIT, AND CHOOSE THE CURRENT ONE. YEARS ARE NEVER DELETED (CLASSES AND EXAMS BELONG TO THEM). */
export function AdminAcademicYears() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<AcademicYearForm>(EMPTY_ACADEMIC_YEAR_FORM);
  const [makingCurrent, setMakingCurrent] = useState<AcademicYear | null>(null);

  const { academicYears } = useReferenceData();
  const list = useApiQuery<PaginatedList<AcademicYear>>(API_PATHS.academicYears, { page, limit: 20 });

  const save = useMutation((values: AcademicYearForm) => (editing ? updateAcademicYear(editing.id, values) : createAcademicYear(values)), {
    successMessage: (year) => (editing ? `Saved ${year.name}.` : `Created ${year.name}.`),
    onSuccess: () => {
      setIsFormOpen(false);
      list.reload();
      void refreshReferenceData();
    },
  });

  const makeCurrent = useMutation((year: AcademicYear) => setCurrentAcademicYear(year.id), {
    successMessage: (year) => `${year.name} is now the current academic year.`,
    onSuccess: () => {
      setMakingCurrent(null);
      list.reload();
      void refreshReferenceData();
    },
  });

  const columns: DataTableColumn<AcademicYear>[] = [
    {
      key: 'name',
      header: 'Academic year',
      cell: (year) => (
        <div className='min-w-0'>
          <span className='flex items-center gap-2 font-medium text-foreground'>
            {year.name}
            {year.isCurrent && <StatusBadge tone='success'>Current</StatusBadge>}
          </span>
          {/* ON PHONES THE DATES SIT UNDER THE NAME INSTEAD OF IN THEIR OWN COLUMNS. */}
          <span className='mt-0.5 block text-xs text-muted-foreground tabular-nums sm:hidden'>
            {formatDate(year.startDate)} – {formatDate(year.endDate)}
          </span>
        </div>
      ),
    },
    { key: 'start', header: 'Starts', className: 'hidden sm:table-cell', cell: (year) => <span className='tabular-nums text-sm'>{formatDate(year.startDate)}</span> },
    { key: 'end', header: 'Ends', className: 'hidden sm:table-cell', cell: (year) => <span className='tabular-nums text-sm'>{formatDate(year.endDate)}</span> },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (year) => (
        <div className='flex justify-end gap-1'>
          {!year.isCurrent && (
            <Button variant='ghost' size='sm' onClick={() => setMakingCurrent(year)} aria-label={`Make ${year.name} current`}>
              <StarIcon aria-hidden />
              <span className='max-sm:sr-only'>Make current</span>
            </Button>
          )}
          <Button variant='ghost' size='sm' onClick={() => openEdit(year)} aria-label={`Edit ${year.name}`}>
            <PencilIcon aria-hidden />
            <span className='max-sm:sr-only'>Edit</span>
          </Button>
        </div>
      ),
    },
  ];

  function openCreate() {
    setEditing(null);
    setForm(suggestNextAcademicYear(academicYears, todayInSchool()));
    save.reset();
    setIsFormOpen(true);
  }

  function openEdit(year: AcademicYear) {
    setEditing(year);
    setForm({ name: year.name, startDate: year.startDate, endDate: year.endDate });
    save.reset();
    setIsFormOpen(true);
  }

  function updateField(field: keyof AcademicYearForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      save.setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ACADEMIC_YEAR_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  function closeMakeCurrent(isOpen: boolean) {
    if (isOpen) return;
    setMakingCurrent(null);
    makeCurrent.reset();
  }

  function confirmMakeCurrent() {
    if (makingCurrent) void makeCurrent.run(makingCurrent);
  }

  return (
    <>
      <PageHeader
        title='Academic years'
        description='Each year has its own classes, enrollments, exams and timetable. Exactly one year is current.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New academic year
          </Button>
        }
      />

      <DataTable
        label='Academic years'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(year) => year.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          <EmptyState
            icon={CalendarRangeIcon}
            title='No academic years yet'
            description='Create the current school year to start adding classes and students.'
            action={<Button onClick={openCreate}>New academic year</Button>}
          />
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='years' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? `Edit ${editing.name}` : 'New academic year'}
        description={editing ? undefined : 'Prefilled as the year after the latest one. You can mark it as current once it is created.'}
        submitLabel={editing ? 'Save changes' : 'Create year'}
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        <FormField id='name' label='Name' description='For example 2026-2027.' error={save.fieldErrors.name} isRequired>
          <Input {...fieldControlProps('name', save.fieldErrors.name, true)} value={form.name} onChange={updateField('name')} autoComplete='off' />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='startDate' label='First day' error={save.fieldErrors.startDate} isRequired>
            <Input {...fieldControlProps('startDate', save.fieldErrors.startDate)} type='date' value={form.startDate} onChange={updateField('startDate')} />
          </FormField>
          <FormField id='endDate' label='Last day' error={save.fieldErrors.endDate} isRequired>
            <Input {...fieldControlProps('endDate', save.fieldErrors.endDate)} type='date' value={form.endDate} onChange={updateField('endDate')} />
          </FormField>
        </div>
      </FormDialog>

      <ConfirmDialog
        isOpen={makingCurrent !== null}
        onOpenChange={closeMakeCurrent}
        title={`Make ${makingCurrent?.name ?? ''} the current year?`}
        description='The dashboard, class lists and new records will default to this year. The previous current year keeps all of its data.'
        confirmLabel='Make current'
        isPending={makeCurrent.isPending}
        errorMessage={makeCurrent.formError}
        onConfirm={confirmMakeCurrent}
      />
    </>
  );
}
