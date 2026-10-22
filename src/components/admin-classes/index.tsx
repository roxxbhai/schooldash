'use client';

import { PencilIcon, PlusIcon, SchoolIcon } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CLASS_FORM_SCHEMA, CLASS_GRADE_OPTIONS, CLASS_SECTION_OPTIONS, EMPTY_CLASS_FORM, type ClassForm } from '@/constants/admin-classes';
import { API_PATHS } from '@/constants/api-client';
import { CLASS_SECTIONS } from '@/constants/classes';
import { createClass, updateClass } from '@/functions/admin-classes';
import { refreshReferenceData } from '@/functions/reference-data';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { academicYearOptions, classLabel, teacherLabel, teacherOptions } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { SchoolClass } from '@/types/classes';

/** "ALL YEARS" IN THE FILTER; `null` MEANS "NOT CHOSEN YET", WHICH FOLLOWS THE CURRENT YEAR. */
const ALL_YEARS = 'all';

/** CLASSES AND SECTIONS PER ACADEMIC YEAR: LIST, CREATE AND EDIT. CLASSES ARE NEVER DELETED. */
export function AdminClasses() {
  const [page, setPage] = useState(1);
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<ClassForm>(EMPTY_CLASS_FORM);

  const { academicYears, classes, teachers, academicYearById, teacherById, currentAcademicYear, isReady } = useReferenceData();

  const selectedYearId = yearChoice === ALL_YEARS ? null : (yearChoice ?? currentAcademicYear?.id ?? null);
  const list = useApiQuery<PaginatedList<SchoolClass>>(isReady ? API_PATHS.classes : null, { page, limit: 50, academicYearId: selectedYearId });

  const save = useMutation((values: ClassForm) => (editing ? updateClass(editing.id, values) : createClass(values)), {
    successMessage: (schoolClass) => (editing ? `Saved class ${classLabel(schoolClass)}.` : `Created class ${classLabel(schoolClass)}.`),
    onSuccess: () => {
      setIsFormOpen(false);
      list.reload();
      void refreshReferenceData();
    },
  });

  const columns: DataTableColumn<SchoolClass>[] = [
    { key: 'class', header: 'Class', cell: (schoolClass) => <span className='font-medium text-foreground'>{classLabel(schoolClass)}</span> },
    {
      key: 'teacher',
      header: 'Class teacher',
      cell: (schoolClass) =>
        schoolClass.classTeacherId ? teacherLabel(teacherById.get(schoolClass.classTeacherId)) : <span className='text-muted-foreground'>Not assigned</span>,
    },
    { key: 'room', header: 'Room', className: 'hidden sm:table-cell', cell: (schoolClass) => <span className='font-mono text-sm'>{schoolClass.roomNumber ?? '—'}</span> },
    {
      key: 'year',
      header: 'Academic year',
      className: 'hidden md:table-cell',
      cell: (schoolClass) => academicYearById.get(schoolClass.academicYearId)?.name ?? '—',
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (schoolClass) => (
        <Button variant='ghost' size='sm' onClick={() => openEdit(schoolClass)} aria-label={`Edit class ${classLabel(schoolClass)}`}>
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

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_CLASS_FORM, academicYearId: selectedYearId ?? currentAcademicYear?.id ?? '' });
    save.reset();
    setIsFormOpen(true);
  }

  function openEdit(schoolClass: SchoolClass) {
    setEditing(schoolClass);
    setForm({
      academicYearId: schoolClass.academicYearId,
      name: schoolClass.name,
      section: schoolClass.section,
      classTeacherId: schoolClass.classTeacherId,
      roomNumber: schoolClass.roomNumber ?? '',
    });
    save.reset();
    setIsFormOpen(true);
  }

  function setField<K extends keyof ClassForm>(field: K, value: ClassForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  /** THE FIRST SECTION (A, B, …) THAT CLASS `grade` DOESN'T HAVE YET IN THE YEAR. */
  function freeSection(academicYearId: string, grade: string): string {
    if (!academicYearId || !grade) return '';
    const usedSections = new Set(
      classes.filter((schoolClass) => schoolClass.academicYearId === academicYearId && schoolClass.name === grade).map((schoolClass) => schoolClass.section),
    );
    return CLASS_SECTIONS.find((section) => !usedSections.has(section)) ?? '';
  }

  /** ON CREATE, A SUGGESTED (OR EMPTY) SECTION FOLLOWS THE YEAR AND CLASS; A CHOSEN ONE IS KEPT. */
  function setPlacementField(field: 'academicYearId' | 'name', value: string) {
    if (editing) {
      setField(field, value);
      return;
    }
    setForm((current) => {
      const next = { ...current, [field]: value };
      const isSuggestedSection = current.section === '' || current.section === freeSection(current.academicYearId, current.name);
      return isSuggestedSection ? { ...next, section: freeSection(next.academicYearId, next.name) } : next;
    });
    save.setFieldErrors((errors) => withoutKey(withoutKey(errors, field), 'section'));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CLASS_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  return (
    <>
      <PageHeader
        title='Classes'
        description='Each class belongs to one academic year. Students are enrolled into classes from the Enrollments page.'
        actions={
          <Button onClick={openCreate} disabled={!isReady || academicYears.length === 0}>
            <PlusIcon aria-hidden />
            New class
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
        label='Classes'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(schoolClass) => schoolClass.id}
        isLoading={list.isLoading || !isReady}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          <EmptyState
            icon={SchoolIcon}
            title={academicYears.length === 0 ? 'Create an academic year first' : 'No classes in this year'}
            description={academicYears.length === 0 ? 'Every class belongs to an academic year.' : 'Add the classes and sections for this year.'}
            action={academicYears.length > 0 ? <Button onClick={openCreate}>New class</Button> : undefined}
          />
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='classes' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? `Edit class ${classLabel(editing)}` : 'New class'}
        submitLabel={editing ? 'Save changes' : 'Create class'}
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        <FormField
          id='academicYearId'
          label='Academic year'
          description={editing ? "A class's year can't change, because its enrollments belong to that year." : undefined}
          error={save.fieldErrors.academicYearId}
          isRequired
        >
          <OptionSelect
            {...fieldControlProps('academicYearId', save.fieldErrors.academicYearId, Boolean(editing))}
            value={form.academicYearId || null}
            onValueChange={(value) => setPlacementField('academicYearId', value ?? '')}
            options={academicYearOptions(academicYears)}
            placeholder='Choose a year'
            isDisabled={Boolean(editing)}
          />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='name' label='Class' error={save.fieldErrors.name} isRequired>
            <OptionSelect
              {...fieldControlProps('name', save.fieldErrors.name)}
              value={form.name || null}
              onValueChange={(value) => setPlacementField('name', value ?? '')}
              options={CLASS_GRADE_OPTIONS}
              placeholder='Choose a class'
            />
          </FormField>
          <FormField
            id='section'
            label='Section'
            description={editing ? undefined : 'The next free section is suggested.'}
            error={save.fieldErrors.section}
            isRequired
          >
            <OptionSelect
              {...fieldControlProps('section', save.fieldErrors.section, !editing)}
              value={form.section || null}
              onValueChange={(value) => setField('section', value ?? '')}
              options={CLASS_SECTION_OPTIONS}
              placeholder='Choose a section'
            />
          </FormField>
        </div>
        <FormField id='classTeacherId' label='Class teacher' description='Optional. Only active teachers are listed.' error={save.fieldErrors.classTeacherId}>
          <OptionSelect
            {...fieldControlProps('classTeacherId', save.fieldErrors.classTeacherId, true)}
            value={form.classTeacherId}
            onValueChange={(value) => setField('classTeacherId', value)}
            options={teacherOptions(teachers, form.classTeacherId)}
            placeholder='No class teacher'
            emptyLabel='No class teacher'
          />
        </FormField>
        <FormField id='roomNumber' label='Room' description='Optional.' error={save.fieldErrors.roomNumber}>
          <Input
            {...fieldControlProps('roomNumber', save.fieldErrors.roomNumber, true)}
            value={form.roomNumber}
            onChange={(event) => setField('roomNumber', event.target.value)}
            className='font-mono'
            autoComplete='off'
          />
        </FormField>
      </FormDialog>
    </>
  );
}
