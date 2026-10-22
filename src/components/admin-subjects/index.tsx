'use client';

import { BookOpenIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EMPTY_SUBJECT_FORM, SUBJECT_FORM_SCHEMA, type SubjectForm } from '@/constants/admin-subjects';
import { API_PATHS } from '@/constants/api-client';
import { createSubject, updateSubject } from '@/functions/admin-subjects';
import { refreshReferenceData } from '@/functions/reference-data';
import { toSearchTerm } from '@/helpers/api-client';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMutation } from '@/hooks/use-mutation';
import type { PaginatedList } from '@/types/api';
import type { Subject } from '@/types/subjects';

/** SUBJECTS: SEARCH, CREATE AND EDIT. SUBJECTS ARE NEVER DELETED (EXAMS AND TIMETABLES REFERENCE THEM). */
export function AdminSubjects() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Subject | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<SubjectForm>(EMPTY_SUBJECT_FORM);

  const debouncedSearch = useDebouncedValue(toSearchTerm(search));
  const list = useApiQuery<PaginatedList<Subject>>(API_PATHS.subjects, { page, limit: 20, search: debouncedSearch });

  const save = useMutation((values: SubjectForm) => (editing ? updateSubject(editing.id, values) : createSubject(values)), {
    successMessage: (subject) => (editing ? `Saved ${subject.name}.` : `Added ${subject.name} as ${subject.code}.`),
    onSuccess: () => {
      setIsFormOpen(false);
      list.reload();
      void refreshReferenceData();
    },
  });

  const columns: DataTableColumn<Subject>[] = [
    { key: 'code', header: 'Code', className: 'w-36', cell: (subject) => <span className='tabular-nums text-sm font-medium'>{subject.code}</span> },
    { key: 'name', header: 'Subject', cell: (subject) => <span className='font-medium text-foreground'>{subject.name}</span> },
    {
      key: 'description',
      header: 'Description',
      className: 'hidden md:table-cell',
      cell: (subject) => <span className='line-clamp-1 text-muted-foreground'>{subject.description ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (subject) => (
        <Button variant='ghost' size='sm' onClick={() => openEdit(subject)} aria-label={`Edit ${subject.name}`}>
          <PencilIcon aria-hidden />
          Edit
        </Button>
      ),
    },
  ];

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_SUBJECT_FORM);
    save.reset();
    setIsFormOpen(true);
  }

  function openEdit(subject: Subject) {
    setEditing(subject);
    setForm({ name: subject.name, description: subject.description ?? '' });
    save.reset();
    setIsFormOpen(true);
  }

  function updateField(field: keyof SubjectForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      save.setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = SUBJECT_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  return (
    <>
      <PageHeader
        title='Subjects'
        description='Subjects are shared by every class and year. Each subject gets the next code automatically.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New subject
          </Button>
        }
      />

      <div className='mb-4'>
        <SearchInput value={search} onChange={handleSearchChange} label='Search subjects' placeholder='Search by code or name' />
      </div>

      <DataTable
        label='Subjects'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(subject) => subject.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          debouncedSearch ? (
            <EmptyState icon={BookOpenIcon} title='No matching subjects' description={`Nothing matches "${debouncedSearch}".`} />
          ) : (
            <EmptyState
              icon={BookOpenIcon}
              title='No subjects yet'
              description='Add the subjects taught at the school.'
              action={<Button onClick={openCreate}>New subject</Button>}
            />
          )
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='subjects' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? `Edit ${editing.name}` : 'New subject'}
        submitLabel={editing ? 'Save changes' : 'Add subject'}
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        {editing && (
          <FormField id='code' label='Code' description='Assigned automatically. It cannot be changed.'>
            <Input {...fieldControlProps('code', undefined, true)} value={editing.code} className='tabular-nums' readOnly disabled />
          </FormField>
        )}
        <FormField id='name' label='Name' description='Letters, numbers and spaces only. Saved in capitals.' error={save.fieldErrors.name} isRequired>
          <Input
            {...fieldControlProps('name', save.fieldErrors.name, true)}
            value={form.name}
            onChange={updateField('name')}
            className='uppercase'
            autoComplete='off'
          />
        </FormField>
        <FormField id='description' label='Description' description='Optional.' error={save.fieldErrors.description}>
          <Textarea
            {...fieldControlProps('description', save.fieldErrors.description, true)}
            value={form.description}
            onChange={updateField('description')}
            rows={3}
          />
        </FormField>
      </FormDialog>
    </>
  );
}
