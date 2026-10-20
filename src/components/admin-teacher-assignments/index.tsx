'use client';

import { PlusIcon, Trash2Icon, UserCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ASSIGNMENT_FORM_SCHEMA, EMPTY_ASSIGNMENT_FORM, type AssignmentForm } from '@/constants/admin-teacher-assignments';
import { API_PATHS } from '@/constants/api-client';
import { createTeacherAssignment, removeTeacherAssignment } from '@/functions/admin-teacher-assignments';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { academicYearOptions, classLabel, classOptions, subjectLabel, subjectOptions, teacherLabel, teacherOptions } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { TeacherAssignment } from '@/types/teacher-assignments';

/** WHAT AN ASSIGNMENT DOES, SHOWN WHERE THERE ARE NONE YET. */
const ASSIGNMENTS_PURPOSE =
  'Assignments decide which classes and subjects a teacher can mark attendance and enter marks for, and who can be put on the timetable.';

/**
 * TEACHER ASSIGNMENTS: WHICH TEACHER TEACHES WHICH SUBJECT TO WHICH CLASS. THERE
 * IS NO EDIT: CHANGE ONE BY REMOVING IT AND ASSIGNING AGAIN.
 */
export function AdminTeacherAssignments() {
  const [page, setPage] = useState(1);
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<AssignmentForm>(EMPTY_ASSIGNMENT_FORM);
  const [formYearId, setFormYearId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeacherAssignment | null>(null);

  const { academicYears, classes, subjects, teachers, academicYearById, classById, subjectById, teacherById, currentAcademicYear, isReady } =
    useReferenceData();

  const selectedYearId = yearChoice ?? currentAcademicYear?.id ?? null;
  const isFiltered = teacherId !== null || classId !== null || subjectId !== null;
  const list = useApiQuery<PaginatedList<TeacherAssignment>>(isReady ? API_PATHS.teacherAssignments : null, {
    page,
    limit: 50,
    teacherId,
    classId,
    subjectId,
  });

  const save = useMutation((values: AssignmentForm) => createTeacherAssignment(values), {
    successMessage: (assignment) =>
      `Assigned ${teacherLabel(teacherById.get(assignment.teacherId))} to ${subjectLabel(subjectById.get(assignment.subjectId))} in ${classLabel(classById.get(assignment.classId))}.`,
    onSuccess: () => {
      setIsFormOpen(false);
      list.reload();
    },
  });

  const remove = useMutation((assignment: TeacherAssignment) => removeTeacherAssignment(assignment.id), {
    successMessage: (assignment) => `Removed ${teacherLabel(teacherById.get(assignment.teacherId))} from ${subjectLabel(subjectById.get(assignment.subjectId))}.`,
    onSuccess: () => {
      setRemoving(null);
      list.reload();
    },
  });

  const columns: DataTableColumn<TeacherAssignment>[] = [
    {
      key: 'teacher',
      header: 'Teacher',
      cell: (assignment) => {
        const teacher = teacherById.get(assignment.teacherId);
        return (
          <span className='flex flex-wrap items-center gap-2 font-medium text-foreground'>
            {teacherLabel(teacher)}
            {teacher && !teacher.user.isActive && <StatusBadge tone='neutral'>Inactive</StatusBadge>}
          </span>
        );
      },
    },
    {
      key: 'class',
      header: 'Class',
      cell: (assignment) => {
        const schoolClass = classById.get(assignment.classId);
        return (
          <span className='flex flex-col'>
            {classLabel(schoolClass)}
            <span className='text-xs text-muted-foreground'>{academicYearById.get(schoolClass?.academicYearId ?? '')?.name ?? ''}</span>
          </span>
        );
      },
    },
    { key: 'subject', header: 'Subject', cell: (assignment) => subjectLabel(subjectById.get(assignment.subjectId)) },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (assignment) => (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => openRemove(assignment)}
          aria-label={`Remove ${teacherLabel(teacherById.get(assignment.teacherId))} from ${subjectLabel(subjectById.get(assignment.subjectId))} in ${classLabel(classById.get(assignment.classId))}`}
        >
          <Trash2Icon aria-hidden />
          Remove
        </Button>
      ),
    },
  ];

  function handleYearChange(value: string | null) {
    setYearChoice(value);
    setClassId(null);
    setPage(1);
  }

  function handleFilterChange(setFilter: (value: string | null) => void) {
    return function handleChange(value: string | null) {
      setFilter(value);
      setPage(1);
    };
  }

  function openCreate() {
    setForm({ teacherId: teacherId ?? '', classId: classId ?? '', subjectId: subjectId ?? '' });
    setFormYearId(selectedYearId);
    save.reset();
    setIsFormOpen(true);
  }

  function setField<K extends keyof AssignmentForm>(field: K, value: AssignmentForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleFormYearChange(value: string | null) {
    setFormYearId(value);
    setField('classId', '');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ASSIGNMENT_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  function openRemove(assignment: TeacherAssignment) {
    remove.reset();
    setRemoving(assignment);
  }

  function closeRemove(isOpen: boolean) {
    if (!isOpen) setRemoving(null);
  }

  function confirmRemove() {
    if (removing) void remove.run(removing);
  }

  return (
    <>
      <PageHeader
        title='Teacher assignments'
        description='Which teacher teaches which subject to which class. To change an assignment, remove it and assign again.'
        actions={
          <Button onClick={openCreate} disabled={!isReady}>
            <PlusIcon aria-hidden />
            Assign teacher
          </Button>
        }
      />

      <div className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <OptionSelect
          aria-label='Teacher'
          value={teacherId}
          onValueChange={handleFilterChange(setTeacherId)}
          options={teacherOptions(teachers, teacherId)}
          placeholder='Teacher'
          emptyLabel='All teachers'
          isDisabled={!isReady}
        />
        <OptionSelect
          aria-label='Academic year of the class'
          value={selectedYearId}
          onValueChange={handleYearChange}
          options={academicYearOptions(academicYears)}
          placeholder='Academic year'
          isDisabled={!isReady}
        />
        <OptionSelect
          aria-label='Class'
          value={classId}
          onValueChange={handleFilterChange(setClassId)}
          options={selectedYearId ? classOptions(classes, selectedYearId) : []}
          placeholder='Class'
          emptyLabel='All classes'
          isDisabled={!isReady}
        />
        <OptionSelect
          aria-label='Subject'
          value={subjectId}
          onValueChange={handleFilterChange(setSubjectId)}
          options={subjectOptions(subjects)}
          placeholder='Subject'
          emptyLabel='All subjects'
          isDisabled={!isReady}
        />
      </div>

      <DataTable
        label='Teacher assignments'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(assignment) => assignment.id}
        isLoading={list.isLoading || !isReady}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          isFiltered ? (
            <EmptyState icon={UserCheckIcon} title='No assignments match these filters' description={ASSIGNMENTS_PURPOSE} />
          ) : (
            <EmptyState
              icon={UserCheckIcon}
              title='No teacher assignments yet'
              description={ASSIGNMENTS_PURPOSE}
              action={<Button onClick={openCreate}>Assign teacher</Button>}
            />
          )
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='assignments' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title='Assign teacher'
        description={ASSIGNMENTS_PURPOSE}
        submitLabel='Assign teacher'
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        <FormField id='teacherId' label='Teacher' description='Only active teachers are listed.' error={save.fieldErrors.teacherId} isRequired>
          <OptionSelect
            {...fieldControlProps('teacherId', save.fieldErrors.teacherId, true)}
            value={form.teacherId || null}
            onValueChange={(value) => setField('teacherId', value ?? '')}
            options={teacherOptions(teachers)}
            placeholder='Choose a teacher'
          />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='academicYearId' label='Academic year' description='Lists the classes of this year.'>
            <OptionSelect
              {...fieldControlProps('academicYearId', undefined, true)}
              value={formYearId}
              onValueChange={handleFormYearChange}
              options={academicYearOptions(academicYears)}
              placeholder='Choose a year'
            />
          </FormField>
          <FormField id='classId' label='Class' error={save.fieldErrors.classId} isRequired>
            <OptionSelect
              {...fieldControlProps('classId', save.fieldErrors.classId)}
              value={form.classId || null}
              onValueChange={(value) => setField('classId', value ?? '')}
              options={formYearId ? classOptions(classes, formYearId) : []}
              placeholder='Choose a class'
              isDisabled={!formYearId}
            />
          </FormField>
        </div>
        <FormField id='subjectId' label='Subject' error={save.fieldErrors.subjectId} isRequired>
          <OptionSelect
            {...fieldControlProps('subjectId', save.fieldErrors.subjectId)}
            value={form.subjectId || null}
            onValueChange={(value) => setField('subjectId', value ?? '')}
            options={subjectOptions(subjects)}
            placeholder='Choose a subject'
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={closeRemove}
        title='Remove this assignment?'
        description={
          removing && (
            <>
              <p>
                {teacherLabel(teacherById.get(removing.teacherId))} will no longer be able to mark attendance or enter marks for{' '}
                {subjectLabel(subjectById.get(removing.subjectId))} in {classLabel(classById.get(removing.classId))}.
              </p>
              <p className='mt-2'>An assignment that is still on the timetable can’t be removed. Remove its timetable periods first.</p>
            </>
          )
        }
        confirmLabel='Remove assignment'
        tone='destructive'
        isPending={remove.isPending}
        errorMessage={remove.formError}
        onConfirm={confirmRemove}
      />
    </>
  );
}
