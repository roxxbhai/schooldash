'use client';

import { PlusIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
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
import { SetupCodeDialog } from '@/components/setup-code-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EMPTY_TEACHER_FORM, TEACHER_FORM_SCHEMA, type TeacherForm } from '@/constants/admin-teachers';
import { API_PATHS } from '@/constants/api-client';
import { ACCOUNT_STATUS_OPTIONS } from '@/constants/people';
import { ROUTES } from '@/constants/routes';
import { createTeacher } from '@/functions/admin-teachers';
import { refreshReferenceData } from '@/functions/reference-data';
import { toSearchTerm } from '@/helpers/api-client';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMutation } from '@/hooks/use-mutation';
import type { CreatedTeacher } from '@/types/admin-teachers';
import type { PaginatedList } from '@/types/api';
import type { Teacher } from '@/types/teachers';

/** TEACHERS: SEARCH, FILTER BY STATUS, AND ADD. EACH NEW TEACHER GETS A ONE-TIME SETUP CODE TO CHOOSE THEIR PASSWORD. */
export function AdminTeachers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TeacherForm>(EMPTY_TEACHER_FORM);
  const [createdTeacher, setCreatedTeacher] = useState<CreatedTeacher | null>(null);

  const debouncedSearch = useDebouncedValue(toSearchTerm(search));
  const list = useApiQuery<PaginatedList<Teacher>>(API_PATHS.teachers, { page, limit: 20, search: debouncedSearch, isActive: statusFilter });

  const create = useMutation((values: TeacherForm) => createTeacher(values), {
    successMessage: (teacher) => `Added ${teacher.user.fullName}.`,
    onSuccess: (teacher) => {
      setIsFormOpen(false);
      list.reload();
      void refreshReferenceData();
      if (teacher.setupCode) {
        setCreatedTeacher(teacher);
        return;
      }
      toast.warning(`${teacher.user.fullName}'s account was created, but a setup code couldn't be issued.`, {
        description: 'Issue one from their profile so they can choose a password.',
      });
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
          <p className='font-mono text-xs text-muted-foreground'>{teacher.user.email}</p>
        </div>
      ),
    },
    { key: 'code', header: 'Employee code', cell: (teacher) => <span className='font-mono text-sm'>{teacher.employeeCode}</span> },
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
      cell: (teacher) => <span className='font-mono text-sm'>{formatDate(teacher.dateOfJoining)}</span>,
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
    setForm(EMPTY_TEACHER_FORM);
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
        description='Each teacher signs in with their own email. A new teacher gets a one-time setup code to choose their password.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New teacher
          </Button>
        }
      />

      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'>
        <SearchInput value={search} onChange={handleSearchChange} label='Search teachers' placeholder='Search by name, email or code' />
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
        description='This creates their login. You will get a one-time setup code to give them, so they can choose their own password.'
        submitLabel='Add teacher'
        isSubmitting={create.isPending}
        formError={create.formError}
        onSubmit={handleSubmit}
      >
        <FormField id='fullName' label='Full name' error={create.fieldErrors.fullName} isRequired>
          <Input {...fieldControlProps('fullName', create.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
        </FormField>
        <FormField id='email' label='Email' description='They sign in with this. It cannot be changed later.' error={create.fieldErrors.email} isRequired>
          <Input
            {...fieldControlProps('email', create.fieldErrors.email, true)}
            type='email'
            value={form.email}
            onChange={updateField('email')}
            className='font-mono'
            autoComplete='off'
            spellCheck={false}
          />
        </FormField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='employeeCode' label='Employee code' error={create.fieldErrors.employeeCode} isRequired>
            <Input
              {...fieldControlProps('employeeCode', create.fieldErrors.employeeCode)}
              value={form.employeeCode}
              onChange={updateField('employeeCode')}
              className='font-mono'
              autoComplete='off'
              spellCheck={false}
            />
          </FormField>
          <FormField id='dateOfJoining' label='Date of joining' description='Optional.' error={create.fieldErrors.dateOfJoining}>
            <Input
              {...fieldControlProps('dateOfJoining', create.fieldErrors.dateOfJoining, true)}
              type='date'
              value={form.dateOfJoining}
              onChange={updateField('dateOfJoining')}
              className='font-mono'
            />
          </FormField>
        </div>
        <FormField id='qualification' label='Qualification' description='Optional. For example M.Sc., B.Ed.' error={create.fieldErrors.qualification}>
          <Input
            {...fieldControlProps('qualification', create.fieldErrors.qualification, true)}
            value={form.qualification}
            onChange={updateField('qualification')}
            autoComplete='off'
          />
        </FormField>
      </FormDialog>

      <SetupCodeDialog
        setupCode={createdTeacher?.setupCode ?? null}
        personName={createdTeacher?.user.fullName ?? ''}
        onClose={() => setCreatedTeacher(null)}
      />
    </>
  );
}
