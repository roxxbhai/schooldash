'use client';

import { PencilIcon, PlusIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StudentPicker } from '@/components/student-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EDIT_ENROLLMENT_FORM_SCHEMA,
  EMPTY_EDIT_ENROLLMENT_FORM,
  EMPTY_ENROLL_FORM,
  ENROLL_FORM_SCHEMA,
  type EditEnrollmentForm,
  type EditEnrollmentValues,
  type EnrollForm,
  type EnrollValues,
} from '@/constants/admin-enrollments';
import { ROUTES } from '@/constants/routes';
import { enrollStudent, loadClassRoster, updateEnrollment } from '@/functions/admin-enrollments';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { academicYearOptions, classLabel, classOptions } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { EnrollmentRow } from '@/types/admin-enrollments';
import type { Student } from '@/types/students';

/**
 * ENROLLMENTS: WHO IS IN EACH CLASS, WITH ROLL NUMBERS. ONE CLASS PER STUDENT PER
 * ACADEMIC YEAR; ENROLLMENTS ARE NEVER DELETED. `?studentId=` OPENS THE ENROLL
 * DIALOG WITH THAT STUDENT CHOSEN (E.G. RIGHT AFTER ADDING THEM).
 */
export function AdminEnrollments() {
  // THE QUERY PARAM SEEDS THE INITIAL STATE, SO IT IS READ BEFORE THE STATE BELOW.
  const searchParams = useSearchParams();
  const linkedStudentId = searchParams.get('studentId');

  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [isEnrollOpen, setIsEnrollOpen] = useState(Boolean(linkedStudentId));
  const [enrollForm, setEnrollForm] = useState<EnrollForm>({ ...EMPTY_ENROLL_FORM, studentId: linkedStudentId ?? '' });
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [editing, setEditing] = useState<EnrollmentRow | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditEnrollmentForm>(EMPTY_EDIT_ENROLLMENT_FORM);

  const router = useRouter();
  const { academicYears, classes, classById, currentAcademicYear, isReady } = useReferenceData();

  const selectedYearId = yearChoice ?? currentAcademicYear?.id ?? null;
  const yearClassOptions = selectedYearId ? classOptions(classes, selectedYearId) : [];
  const selectedClass = classId ? classById.get(classId) : undefined;

  const roster = useAsyncResult<EnrollmentRow[]>(classId ? `enrollments|${classId}` : null, () => loadClassRoster(classId ?? ''));
  const enrolledIds = new Set((roster.data ?? []).map((row) => row.enrollment.studentId));
  // THE NEXT ROLL NUMBER IN THE CLASS SHOWN ON THE PAGE (THE ONLY ROSTER THAT IS LOADED).
  const nextRollNumber = roster.data ? String(Math.max(0, ...roster.data.map((row) => row.enrollment.rollNumber ?? 0)) + 1) : '';

  const enroll = useMutation((values: EnrollValues) => enrollStudent(values), {
    successMessage: (enrollment) =>
      `Enrolled ${enrollingStudent?.id === enrollment.studentId ? enrollingStudent.user.fullName : 'the student'} in ${classLabel(classById.get(enrollment.classId))}.`,
    onSuccess: (enrollment) => {
      closeEnroll();
      // SHOW THE CLASS THE STUDENT WAS JUST ENROLLED IN.
      setYearChoice(enrollment.academicYearId);
      setClassId(enrollment.classId);
      roster.reload();
    },
  });

  const edit = useMutation((input: { row: EnrollmentRow; values: EditEnrollmentValues }) => updateEnrollment(input.row.enrollment, input.values), {
    successMessage: (enrollment) => {
      const name = editing?.student?.user.fullName ?? 'the student';
      return enrollment.classId !== editing?.enrollment.classId
        ? `Moved ${name} to ${classLabel(classById.get(enrollment.classId))}.`
        : `Saved the roll number for ${name}.`;
    },
    onSuccess: () => {
      setIsEditOpen(false);
      roster.reload();
    },
  });

  const columns: DataTableColumn<EnrollmentRow>[] = [
    {
      key: 'roll',
      header: 'Roll no.',
      className: 'w-24',
      cell: (row) => <span className='font-mono text-sm'>{row.enrollment.rollNumber ?? '—'}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      cell: (row) =>
        row.student ? (
          <Link
            href={`${ROUTES.admin.students}/${row.enrollment.studentId}`}
            className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'
          >
            {row.student.user.fullName}
          </Link>
        ) : (
          <span className='text-muted-foreground'>Unknown student</span>
        ),
    },
    {
      key: 'admission',
      header: 'Admission no.',
      cell: (row) => <span className='font-mono text-sm'>{row.student?.admissionNumber ?? '—'}</span>,
    },
    {
      key: 'enrolled',
      header: 'Enrolled on',
      className: 'hidden sm:table-cell',
      cell: (row) => <span className='font-mono text-sm'>{formatDate(row.enrollment.enrolledOn)}</span>,
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (row) => (
        <Button variant='ghost' size='sm' onClick={() => openEdit(row)} aria-label={`Edit enrollment of ${row.student?.user.fullName ?? 'this student'}`}>
          <PencilIcon aria-hidden />
          Edit
        </Button>
      ),
    },
  ];

  function handleYearChange(value: string | null) {
    setYearChoice(value);
    setClassId(null);
  }

  function openEnroll() {
    setEnrollForm({ ...EMPTY_ENROLL_FORM, classId: classId ?? '', rollNumber: classId ? nextRollNumber : '' });
    setEnrollingStudent(null);
    enroll.reset();
    setIsEnrollOpen(true);
  }

  function closeEnroll() {
    setIsEnrollOpen(false);
    // DROP ?studentId= SO A REFRESH DOESN'T OPEN THE DIALOG AGAIN.
    if (linkedStudentId) router.replace(ROUTES.admin.enrollments, { scroll: false });
  }

  function handleEnrollOpenChange(isOpen: boolean) {
    if (isOpen) return;
    closeEnroll();
  }

  function setEnrollField<K extends keyof EnrollForm>(field: K, value: EnrollForm[K]) {
    setEnrollForm((current) => ({ ...current, [field]: value }));
    enroll.setFieldErrors((errors) => withoutKey(errors, field));
  }

  /** KEEPS A TYPED ROLL NUMBER; A SUGGESTED ONE FOLLOWS THE CLASS (CLEARED FOR A CLASS WHOSE ROSTER ISN'T LOADED). */
  function handleEnrollClassChange(value: string | null) {
    const nextClassId = value ?? '';
    setEnrollForm((current) => {
      const isSuggestedRoll = current.rollNumber === (current.classId === classId ? nextRollNumber : '');
      const rollNumber = isSuggestedRoll ? (nextClassId === classId ? nextRollNumber : '') : current.rollNumber;
      return { ...current, classId: nextClassId, rollNumber };
    });
    enroll.setFieldErrors((errors) => withoutKey(errors, 'classId'));
  }

  function handleStudentChange(student: Student | null) {
    setEnrollingStudent(student);
    setEnrollField('studentId', student?.id ?? '');
  }

  function handleEnrollSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ENROLL_FORM_SCHEMA.safeParse(enrollForm);
    if (!parsed.success) {
      enroll.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void enroll.run(parsed.data);
  }

  function openEdit(row: EnrollmentRow) {
    setEditing(row);
    setEditForm({ classId: row.enrollment.classId, rollNumber: row.enrollment.rollNumber === null ? '' : String(row.enrollment.rollNumber) });
    edit.reset();
    setIsEditOpen(true);
  }

  function setEditField<K extends keyof EditEnrollmentForm>(field: K, value: EditEnrollmentForm[K]) {
    setEditForm((current) => ({ ...current, [field]: value }));
    edit.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const parsed = EDIT_ENROLLMENT_FORM_SCHEMA.safeParse(editForm);
    if (!parsed.success) {
      edit.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    // NOTHING CHANGED: THERE IS NOTHING TO SAVE.
    if (parsed.data.classId === editing.enrollment.classId && parsed.data.rollNumber === editing.enrollment.rollNumber) {
      setIsEditOpen(false);
      return;
    }
    void edit.run({ row: editing, values: parsed.data });
  }

  return (
    <>
      <PageHeader
        title='Enrollments'
        description='Each student is enrolled in one class per academic year. Enrollments are kept as history and are never deleted.'
        actions={
          <Button onClick={openEnroll} disabled={!isReady || yearClassOptions.length === 0}>
            <PlusIcon aria-hidden />
            Enroll student
          </Button>
        }
      />

      <div className='mb-4 flex flex-col gap-3 sm:flex-row'>
        <div className='w-full sm:w-64'>
          <OptionSelect
            aria-label='Academic year'
            value={selectedYearId}
            onValueChange={handleYearChange}
            options={academicYearOptions(academicYears)}
            placeholder='Academic year'
            isDisabled={!isReady}
          />
        </div>
        <div className='w-full sm:w-64'>
          <OptionSelect
            aria-label='Class'
            value={classId}
            onValueChange={setClassId}
            options={yearClassOptions}
            placeholder='Choose a class'
            isDisabled={!isReady || yearClassOptions.length === 0}
          />
        </div>
      </div>

      {classId === null ? (
        <Panel bodyClassName='p-0'>
          <EmptyState
            icon={UsersIcon}
            title={isReady && academicYears.length === 0 ? 'Create an academic year first' : 'Choose a class'}
            description={
              isReady && selectedYearId !== null && yearClassOptions.length === 0
                ? 'This academic year has no classes yet. Add them on the Classes page.'
                : 'Pick an academic year and a class to see who is enrolled in it.'
            }
          />
        </Panel>
      ) : (
        <DataTable
          label={`Students enrolled in ${classLabel(selectedClass)}`}
          columns={columns}
          rows={roster.data}
          getRowKey={(row) => row.enrollment.id}
          isLoading={roster.isLoading}
          errorMessage={roster.errorMessage}
          onRetry={roster.reload}
          empty={
            <EmptyState
              icon={UsersIcon}
              title={`No students enrolled in ${classLabel(selectedClass)}`}
              description='Enroll the students who study in this class this year.'
              action={<Button onClick={openEnroll}>Enroll student</Button>}
            />
          }
        />
      )}

      <FormDialog
        isOpen={isEnrollOpen}
        onOpenChange={handleEnrollOpenChange}
        title='Enroll student'
        description='Only active students can be enrolled, and each student in one class per academic year.'
        submitLabel='Enroll student'
        isSubmitting={enroll.isPending}
        formError={enroll.formError}
        onSubmit={handleEnrollSubmit}
      >
        <FormField id='studentId' label='Student' description='Search by name, admission number or email.' error={enroll.fieldErrors.studentId} isRequired>
          <StudentPicker
            {...fieldControlProps('studentId', enroll.fieldErrors.studentId, true)}
            value={enrollForm.studentId || null}
            onChange={handleStudentChange}
            excludeIds={enrollForm.classId === classId ? enrolledIds : undefined}
          />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-[1fr_10rem]'>
          <FormField id='classId' label='Class' error={enroll.fieldErrors.classId} isRequired>
            <OptionSelect
              {...fieldControlProps('classId', enroll.fieldErrors.classId)}
              value={enrollForm.classId || null}
              onValueChange={handleEnrollClassChange}
              options={yearClassOptions}
              placeholder='Choose a class'
            />
          </FormField>
          <FormField
            id='rollNumber'
            label='Roll number'
            description={enrollForm.classId && enrollForm.classId === classId ? 'Next in this class. Optional.' : 'Optional.'}
            error={enroll.fieldErrors.rollNumber}
          >
            <Input
              {...fieldControlProps('rollNumber', enroll.fieldErrors.rollNumber, true)}
              value={enrollForm.rollNumber}
              onChange={(event) => setEnrollField('rollNumber', event.target.value)}
              inputMode='numeric'
              className='font-mono'
              autoComplete='off'
            />
          </FormField>
        </div>
      </FormDialog>

      <FormDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        title={`Edit enrollment of ${editing?.student?.user.fullName ?? 'student'}`}
        description='A student can only move to a class in the same academic year, and only before attendance or results are recorded.'
        submitLabel='Save changes'
        isSubmitting={edit.isPending}
        formError={edit.formError}
        onSubmit={handleEditSubmit}
      >
        <FormField id='editRollNumber' label='Roll number' description='Leave empty for no roll number.' error={edit.fieldErrors.rollNumber}>
          <Input
            {...fieldControlProps('editRollNumber', edit.fieldErrors.rollNumber, true)}
            value={editForm.rollNumber}
            onChange={(event) => setEditField('rollNumber', event.target.value)}
            inputMode='numeric'
            className='font-mono'
            autoComplete='off'
          />
        </FormField>
        <FormField id='editClassId' label='Move to class' error={edit.fieldErrors.classId} isRequired>
          <OptionSelect
            {...fieldControlProps('editClassId', edit.fieldErrors.classId)}
            value={editForm.classId || null}
            onValueChange={(value) => setEditField('classId', value ?? '')}
            options={editing ? classOptions(classes, editing.enrollment.academicYearId) : []}
            placeholder='Choose a class'
          />
        </FormField>
      </FormDialog>
    </>
  );
}
