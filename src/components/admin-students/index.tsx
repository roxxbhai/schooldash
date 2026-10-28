'use client';

import { GraduationCapIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AccountStatusBadge } from '@/components/account-status-badge';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BLOOD_GROUP_OPTIONS, EMPTY_STUDENT_FORM, GENDER_OPTIONS, STUDENT_FORM_SCHEMA, type StudentForm, type StudentValues } from '@/constants/admin-students';
import { API_PATHS } from '@/constants/api-client';
import { ACCOUNT_STATUS_OPTIONS } from '@/constants/people';
import { ROUTES } from '@/constants/routes';
import { createStudent, loadNextRollNumber } from '@/functions/admin-students';
import { toSearchTerm } from '@/helpers/api-client';
import { todayInSchool } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { classLabel, classOptions } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { CreatedStudent } from '@/types/admin-students';
import type { PaginatedList } from '@/types/api';
import type { Student } from '@/types/students';

/** STUDENTS: SEARCH, FILTER BY CLASS AND STATUS, AND ADD. A NEW STUDENT SIGNS IN WITH THEIR ADMISSION NUMBER AND CAN BE ENROLLED IN A CLASS AS THEY ARE ADDED. */
export function AdminStudents() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<StudentForm>(EMPTY_STUDENT_FORM);
  const [isRollNumberEdited, setIsRollNumberEdited] = useState(false);

  const { classes, classById, currentAcademicYear, isReady } = useReferenceData();
  const router = useRouter();
  const debouncedSearch = useDebouncedValue(toSearchTerm(search));
  const list = useApiQuery<PaginatedList<Student>>(API_PATHS.students, {
    page,
    limit: 20,
    search: debouncedSearch,
    classId: classFilter,
    isActive: statusFilter,
  });

  // THE NEXT FREE ROLL NUMBER IN THE CLASS CHOSEN IN THE FORM, SUGGESTED UNTIL THE ADMIN TYPES THEIR OWN.
  const nextRollNumber = useAsyncResult(isFormOpen && form.classId ? `next-roll|${form.classId}` : null, () => loadNextRollNumber(form.classId ?? ''));
  const create = useMutation((values: StudentValues) => createStudent(values), {
    onSuccess: (student: CreatedStudent) => {
      setIsFormOpen(false);
      list.reload();
      const enrollAction = { label: 'Enroll', onClick: () => router.push(`${ROUTES.admin.enrollments}?studentId=${student.id}`) };
      if (student.enrollment) {
        const rollText = student.enrollment.rollNumber === null ? '' : `, roll number ${student.enrollment.rollNumber}`;
        toast.success(`Added ${student.user.fullName} to class ${classLabel(classById.get(student.enrollment.classId))}${rollText}.`, {
          description: `They sign in with admission number ${student.admissionNumber}.`,
        });
        return;
      }
      if (form.classId) {
        toast.warning(`Added ${student.user.fullName}, but couldn't enroll them in the class.`, {
          description: 'Enroll them from the Enrollments page.',
          action: enrollAction,
        });
        return;
      }
      toast.success(`Added ${student.user.fullName}.`, {
        description: `They sign in with admission number ${student.admissionNumber}. Next, enroll them in a class.`,
        action: enrollAction,
      });
    },
  });

  const isFiltered = Boolean(debouncedSearch) || classFilter !== null || statusFilter !== null;
  const currentClassOptions = currentAcademicYear ? classOptions(classes, currentAcademicYear.id) : [];
  const suggestedRollNumber = form.classId && !nextRollNumber.isLoading ? (nextRollNumber.data ?? '') : '';
  const rollNumber = isRollNumberEdited ? form.rollNumber : suggestedRollNumber;

  const columns: DataTableColumn<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      cell: (student) => (
        <div className='min-w-0'>
          <Link href={`${ROUTES.admin.students}/${student.id}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
            {student.user.fullName}
          </Link>
          {student.user.email && <p className='tabular-nums text-xs text-muted-foreground'>{student.user.email}</p>}
        </div>
      ),
    },
    { key: 'admission', header: 'Admission no.', cell: (student) => <span className='tabular-nums text-sm'>{student.admissionNumber}</span> },
    { key: 'status', header: 'Status', cell: (student) => <AccountStatusBadge isActive={student.user.isActive} graduatedOn={student.graduatedOn} /> },
  ];

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleClassChange(value: string | null) {
    setClassFilter(value);
    setPage(1);
  }

  function handleStatusChange(value: string | null) {
    setStatusFilter(value);
    setPage(1);
  }

  function openCreate() {
    // A LIST FILTERED TO ONE CLASS SUGGESTS THAT CLASS FOR THE NEW STUDENT.
    setForm({ ...EMPTY_STUDENT_FORM, admissionDate: todayInSchool(), classId: classFilter });
    setIsRollNumberEdited(false);
    create.reset();
    setIsFormOpen(true);
  }

  function setField<K extends keyof StudentForm>(field: K, value: StudentForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    create.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleFormClassChange(value: string | null) {
    setField('classId', value);
    create.setFieldErrors((errors) => withoutKey(errors, 'rollNumber'));
    // WITHOUT A CLASS THERE IS NO ROLL NUMBER; A NEW CLASS STARTS FROM ITS OWN SUGGESTION AGAIN.
    if (!value) {
      setField('rollNumber', '');
      setIsRollNumberEdited(false);
    }
  }

  function handleRollNumberChange(event: React.ChangeEvent<HTMLInputElement>) {
    setField('rollNumber', event.target.value);
    setIsRollNumberEdited(true);
  }

  function updateField(field: keyof StudentForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      setField(field, event.target.value);
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = STUDENT_FORM_SCHEMA.safeParse({ ...form, rollNumber: form.classId ? rollNumber : '' });
    if (!parsed.success) {
      create.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void create.run(parsed.data);
  }

  return (
    <>
      <PageHeader
        title='Students'
        description='Each student signs in with their admission number. Choose their class while adding them, or enroll them later from the Enrollments page.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New student
          </Button>
        }
      />

      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        <SearchInput value={search} onChange={handleSearchChange} label='Search students' placeholder='Search by name, email or admission no.' />
        <div className='w-full sm:w-48'>
          <OptionSelect
            aria-label='Class'
            value={classFilter}
            onValueChange={handleClassChange}
            options={currentClassOptions}
            placeholder='Class'
            emptyLabel='All classes'
            isDisabled={!isReady}
          />
        </div>
        <div className='w-full sm:w-44'>
          <OptionSelect
            aria-label='Status'
            value={statusFilter}
            onValueChange={handleStatusChange}
            options={ACCOUNT_STATUS_OPTIONS}
            placeholder='Status'
            emptyLabel='All statuses'
          />
        </div>
      </div>

      <DataTable
        label='Students'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(student) => student.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          isFiltered ? (
            <EmptyState icon={GraduationCapIcon} title='No matching students' description='Try a different search, class or status.' />
          ) : (
            <EmptyState
              icon={GraduationCapIcon}
              title='No students yet'
              description='Add students, then enroll them in their classes.'
              action={<Button onClick={openCreate}>New student</Button>}
            />
          )
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='students' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title='New student'
        description='This creates their login. They sign in with their admission number; no password is needed.'
        submitLabel='Add student'
        isSubmitting={create.isPending}
        formError={create.formError}
        onSubmit={handleSubmit}
        size='lg'
      >
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='fullName' label='Full name' error={create.fieldErrors.fullName} isRequired>
            <Input {...fieldControlProps('fullName', create.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
          </FormField>
          <FormField id='admissionNumber' label='Admission number' description='They sign in with this.' error={create.fieldErrors.admissionNumber} isRequired>
            <Input
              {...fieldControlProps('admissionNumber', create.fieldErrors.admissionNumber, true)}
              value={form.admissionNumber}
              onChange={updateField('admissionNumber')}
              className='tabular-nums'
              autoComplete='off'
              spellCheck={false}
            />
          </FormField>
          <FormField id='classId' label='Class' description={`Enrolls them in ${currentAcademicYear?.name ?? 'the current year'}. Optional.`} error={create.fieldErrors.classId}>
            <OptionSelect
              {...fieldControlProps('classId', create.fieldErrors.classId, true)}
              value={form.classId}
              onValueChange={handleFormClassChange}
              options={currentClassOptions}
              placeholder={currentClassOptions.length === 0 ? 'No classes this year' : 'Not enrolled yet'}
              emptyLabel='Not enrolled yet'
              isDisabled={!isReady || currentClassOptions.length === 0}
            />
          </FormField>
          <FormField
            id='rollNumber'
            label='Roll number'
            description={form.classId ? (isRollNumberEdited ? 'Optional.' : 'Next in this class. Optional.') : 'Choose a class first.'}
            error={create.fieldErrors.rollNumber}
          >
            <Input
              {...fieldControlProps('rollNumber', create.fieldErrors.rollNumber, true)}
              value={form.classId ? rollNumber : ''}
              onChange={handleRollNumberChange}
              placeholder={form.classId && nextRollNumber.isLoading ? 'Loading…' : undefined}
              disabled={!form.classId}
              inputMode='numeric'
              className='tabular-nums'
              autoComplete='off'
            />
          </FormField>
          <FormField
            id='email'
            label='Email'
            description='Optional. For school records; it cannot be changed later.'
            error={create.fieldErrors.email}
            className='sm:col-span-2'
          >
            <Input
              {...fieldControlProps('email', create.fieldErrors.email, true)}
              type='email'
              value={form.email}
              onChange={updateField('email')}
              className='tabular-nums'
              autoComplete='off'
              spellCheck={false}
            />
          </FormField>
          <FormField id='admissionDate' label='Admission date' error={create.fieldErrors.admissionDate}>
            <Input
              {...fieldControlProps('admissionDate', create.fieldErrors.admissionDate)}
              type='date'
              value={form.admissionDate}
              onChange={updateField('admissionDate')}
              className='tabular-nums'
            />
          </FormField>
          <FormField id='dateOfBirth' label='Date of birth' error={create.fieldErrors.dateOfBirth}>
            <Input
              {...fieldControlProps('dateOfBirth', create.fieldErrors.dateOfBirth)}
              type='date'
              max={todayInSchool()}
              value={form.dateOfBirth}
              onChange={updateField('dateOfBirth')}
              className='tabular-nums'
            />
          </FormField>
          <FormField id='gender' label='Gender' error={create.fieldErrors.gender}>
            <OptionSelect
              {...fieldControlProps('gender', create.fieldErrors.gender)}
              value={form.gender}
              onValueChange={(value) => setField('gender', value)}
              options={GENDER_OPTIONS}
              placeholder='Not specified'
              emptyLabel='Not specified'
            />
          </FormField>
          <FormField id='bloodGroup' label='Blood group' error={create.fieldErrors.bloodGroup}>
            <OptionSelect
              {...fieldControlProps('bloodGroup', create.fieldErrors.bloodGroup)}
              value={form.bloodGroup}
              onValueChange={(value) => setField('bloodGroup', value)}
              options={BLOOD_GROUP_OPTIONS}
              placeholder='Not specified'
              emptyLabel='Not specified'
            />
          </FormField>
          <FormField id='fatherName' label="Father's name" error={create.fieldErrors.fatherName}>
            <Input {...fieldControlProps('fatherName', create.fieldErrors.fatherName)} value={form.fatherName} onChange={updateField('fatherName')} autoComplete='off' />
          </FormField>
          <FormField id='motherName' label="Mother's name" error={create.fieldErrors.motherName}>
            <Input {...fieldControlProps('motherName', create.fieldErrors.motherName)} value={form.motherName} onChange={updateField('motherName')} autoComplete='off' />
          </FormField>
          <FormField id='address' label='Address' error={create.fieldErrors.address} className='sm:col-span-2'>
            <Textarea {...fieldControlProps('address', create.fieldErrors.address)} value={form.address} onChange={updateField('address')} rows={3} />
          </FormField>
        </div>
        <p className='text-sm text-muted-foreground'>Fields without a star are optional. Phone numbers can be added from the profile.</p>
      </FormDialog>

    </>
  );
}
