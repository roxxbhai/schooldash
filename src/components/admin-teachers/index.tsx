'use client';

import { PlusIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
import { EMPTY_TEACHER_FORM, TEACHER_FORM_SCHEMA, type TeacherForm } from '@/constants/admin-teachers';
import { API_PATHS } from '@/constants/api-client';
import { ACCOUNT_STATUS_OPTIONS } from '@/constants/people';
import { ROUTES } from '@/constants/routes';
import { createTeacher } from '@/functions/admin-teachers';
import { refreshReferenceData } from '@/functions/reference-data';
import { toSearchTerm } from '@/helpers/api-client';
import { formatDate, todayInSchool } from '@/helpers/format';
import { formatPhone } from '@/helpers/phone';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMutation } from '@/hooks/use-mutation';
import type { PaginatedList } from '@/types/api';
import type { Teacher } from '@/types/teachers';

/** TEACHERS: SEARCH, FILTER BY STATUS, AND ADD. A NEW TEACHER SIGNS UP WITH THE MOBILE NUMBER ENTERED HERE AND CHOOSES THEIR PASSWORD. */
export function AdminTeachers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TeacherForm>(EMPTY_TEACHER_FORM);

  const debouncedSearch = useDebouncedValue(toSearchTerm(search));
  const list = useApiQuery<PaginatedList<Teacher>>(API_PATHS.teachers, { page, limit: 20, search: debouncedSearch, isActive: statusFilter });

  const create = useMutation((values: TeacherForm) => createTeacher(values), {
    successMessage: (teacher) => `Added ${teacher.user.fullName} as ${teacher.employeeCode}. They can now sign up on the teacher sign-up page with ${formatPhone(teacher.user.phone)}.`,
    onSuccess: () => {
      setIsFormOpen(false);
      list.reload();
      void refreshReferenceData();
    },
  });

  const isFiltered = Boolean(debouncedSearch) || statusFilter !== null;

  const columns: DataTableColumn<Teacher>[] = [
    {
      key: 'name',
      header: 'Teacher',
      cell: (teacher) => (
        <div className='min-w-0'>
          <Link href={`${ROUTES.admin.teachers}/${teacher.id}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
            {teacher.user.fullName}
          </Link>
          <p className='tabular-nums text-xs text-muted-foreground'>{formatPhone(teacher.user.phone)}</p>
        </div>
      ),
    },
    { key: 'code', header: 'Employee code', cell: (teacher) => <span className='tabular-nums text-sm'>{teacher.employeeCode}</span> },
    {
      key: 'qualification',
      header: 'Qualification',
      className: 'hidden md:table-cell',
      cell: (teacher) => <span className='line-clamp-1 text-muted-foreground'>{teacher.qualification ?? '—'}</span>,
    },
    {
      key: 'joined',
      header: 'Joined',
      className: 'hidden lg:table-cell',
      cell: (teacher) => <span className='tabular-nums text-sm'>{formatDate(teacher.dateOfJoining)}</span>,
    },
    { key: 'status', header: 'Status', cell: (teacher) => <AccountStatusBadge isActive={teacher.user.isActive} /> },
  ];

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string | null) {
    setStatusFilter(value);
    setPage(1);
  }

  function openCreate() {
    setForm({ ...EMPTY_TEACHER_FORM, dateOfJoining: todayInSchool() });
    create.reset();
    setIsFormOpen(true);
  }

  function updateField(field: keyof TeacherForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      create.setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = TEACHER_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      create.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void create.run(parsed.data);
  }

  return (
    <>
      <PageHeader
        title='Teachers'
        description='Each teacher signs in with their mobile number. A new teacher signs up once with the number you enter here and chooses their password.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New teacher
          </Button>
        }
      />

      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'>
        <SearchInput value={search} onChange={handleSearchChange} label='Search teachers' placeholder='Search by name, mobile, email or code' />
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
        label='Teachers'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(teacher) => teacher.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          isFiltered ? (
            <EmptyState icon={UsersIcon} title='No matching teachers' description='Try a different search or status.' />
          ) : (
            <EmptyState
              icon={UsersIcon}
              title='No teachers yet'
              description='Add the teaching staff so they can be assigned to classes and subjects.'
              action={<Button onClick={openCreate}>New teacher</Button>}
            />
          )
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='teachers' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title='New teacher'
        description='This creates their login and assigns the next employee code automatically. They then sign up on the teacher sign-up page with this mobile number and choose their own password.'
        submitLabel='Add teacher'
        isSubmitting={create.isPending}
        formError={create.formError}
        onSubmit={handleSubmit}
      >
        <FormField id='fullName' label='Full name' error={create.fieldErrors.fullName} isRequired>
          <Input {...fieldControlProps('fullName', create.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
        </FormField>
        <FormField id='phone' label='Mobile number' description='They sign in with this number.' error={create.fieldErrors.phone} isRequired>
          <Input
            {...fieldControlProps('phone', create.fieldErrors.phone, true)}
            type='tel'
            inputMode='tel'
            placeholder='98765 43210'
            value={form.phone}
            onChange={updateField('phone')}
            className='tabular-nums'
            autoComplete='off'
          />
        </FormField>
        <FormField id='email' label='Email' description='Optional. For school records; it cannot be changed later.' error={create.fieldErrors.email}>
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
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='qualification' label='Qualification' description='Optional. For example M.Sc., B.Ed.' error={create.fieldErrors.qualification}>
            <Input
              {...fieldControlProps('qualification', create.fieldErrors.qualification, true)}
              value={form.qualification}
              onChange={updateField('qualification')}
              autoComplete='off'
            />
          </FormField>
          <FormField id='dateOfJoining' label='Date of joining' description='Today by default. Optional.' error={create.fieldErrors.dateOfJoining}>
            <Input
              {...fieldControlProps('dateOfJoining', create.fieldErrors.dateOfJoining, true)}
              type='date'
              value={form.dateOfJoining}
              onChange={updateField('dateOfJoining')}
              className='tabular-nums'
            />
          </FormField>
        </div>
      </FormDialog>

    </>
  );
}
