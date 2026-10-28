'use client';

import { MegaphoneIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { NoticeAudiencePicker } from '@/components/notice-audience-picker';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  ALL_STATUSES,
  AUDIENCE_SELECTION_SCHEMA,
  EMPTY_NOTICE_FORM,
  NOTICE_CONTENT_SCHEMA,
  NOTICE_STATUS_META,
  NOTICE_STATUS_TABS,
  type NewNoticeForm,
} from '@/constants/admin-notices';
import { API_PATHS } from '@/constants/api-client';
import { createNotice } from '@/functions/admin-notices';
import { audienceError, audienceSummary, noticeDetailPath, noticeListDate } from '@/helpers/admin-notices';
import { formatDateTime } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AdminNotice, AudienceSelection } from '@/types/admin-notices';
import type { PaginatedList } from '@/types/api';

type StatusTab = (typeof NOTICE_STATUS_TABS)[number]['value'];

/** NOTICES IN EVERY STATE, FILTERED BY STATUS, AND THE FORM THAT STARTS A NEW DRAFT. NOTICES ARE NEVER DELETED. */
export function AdminNotices() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusTab>(ALL_STATUSES);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<NewNoticeForm>(EMPTY_NOTICE_FORM);

  const router = useRouter();
  const { classById } = useReferenceData();
  const list = useApiQuery<PaginatedList<AdminNotice>>(API_PATHS.notices, { page, limit: 20, status: status === ALL_STATUSES ? null : status });

  const save = useMutation((values: NewNoticeForm) => createNotice(values), {
    successMessage: (notice) => `Saved "${notice.title}" as a draft.`,
    onSuccess: (notice) => {
      setIsFormOpen(false);
      list.reload();
      router.push(noticeDetailPath(notice.id));
    },
  });

  const columns: DataTableColumn<AdminNotice>[] = [
    {
      key: 'title',
      header: 'Title',
      className: 'min-w-0 whitespace-normal',
      cell: (notice) => (
        <Link href={noticeDetailPath(notice.id)} className='line-clamp-2 font-medium text-foreground underline-offset-2 hover:text-primary hover:underline'>
          {notice.title}
        </Link>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      className: 'hidden sm:table-cell',
      cell: (notice) => (notice.category ? notice.category : <span className='text-muted-foreground'>—</span>),
    },
    {
      key: 'audience',
      header: 'Audience',
      className: 'hidden md:table-cell',
      cell: (notice) => (
        <span className={notice.audiences.length === 0 ? 'text-muted-foreground' : 'line-clamp-2 text-sm'}>{audienceSummary(notice.audiences, classById)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (notice) => <StatusBadge tone={NOTICE_STATUS_META[notice.status].tone}>{NOTICE_STATUS_META[notice.status].label}</StatusBadge>,
    },
    {
      key: 'date',
      header: 'Date',
      className: 'hidden lg:table-cell',
      cell: (notice) => (
        <span className='flex flex-col'>
          <span className='tabular-nums text-sm whitespace-nowrap'>{formatDateTime(noticeListDate(notice))}</span>
          <span className='text-xs text-muted-foreground'>{notice.status === 'published' ? 'Published' : 'Updated'}</span>
        </span>
      ),
    },
  ];

  function handleStatusChange(value: string) {
    setStatus(value as StatusTab);
    setPage(1);
  }

  function openCreate() {
    setForm(EMPTY_NOTICE_FORM);
    save.reset();
    setIsFormOpen(true);
  }

  function setField(field: 'title' | 'body' | 'category', value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function setAudiences(audiences: AudienceSelection) {
    setForm((current) => ({ ...current, audiences }));
    save.setFieldErrors((errors) => Object.fromEntries(Object.entries(errors).filter(([path]) => !path.startsWith('audiences'))));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = NOTICE_CONTENT_SCHEMA.safeParse(form);
    const audiences = AUDIENCE_SELECTION_SCHEMA.safeParse(form.audiences);
    if (!content.success || !audiences.success) {
      save.setFieldErrors({ ...(content.success ? {} : zodFieldErrors(content.error)), ...(audiences.success ? {} : zodFieldErrors(audiences.error)) });
      return;
    }
    void save.run({ ...content.data, audiences: form.audiences });
  }

  return (
    <>
      <PageHeader
        title='Notices'
        description='Announcements for students, teachers and classes. A notice is read in the portal once it is published; no email or SMS is sent.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New notice
          </Button>
        }
      />

      <Tabs value={status} onValueChange={handleStatusChange} className='mb-4'>
        <TabsList aria-label='Notice status'>
          {NOTICE_STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className='px-3'>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        label='Notices'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(notice) => notice.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={
          <EmptyState
            icon={MegaphoneIcon}
            title={status === ALL_STATUSES ? 'No notices yet' : `No ${NOTICE_STATUS_TABS.find((tab) => tab.value === status)?.label.toLowerCase()} notices`}
            description={
              status === 'archived'
                ? 'Archived notices appear here once a draft or published notice is archived.'
                : 'Write a notice, choose who should see it, then publish it from its page.'
            }
            action={status === 'archived' ? undefined : <Button onClick={openCreate}>New notice</Button>}
          />
        }
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='notices' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title='New notice'
        description='Saved as a draft. Nobody sees it until you publish it from its page.'
        submitLabel='Save draft'
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
        size='lg'
      >
        <FormField id='title' label='Title' error={save.fieldErrors.title} isRequired>
          <Input {...fieldControlProps('title', save.fieldErrors.title)} value={form.title} onChange={(event) => setField('title', event.target.value)} autoComplete='off' />
        </FormField>
        <FormField id='body' label='Notice' description='Plain text. Line breaks are kept.' error={save.fieldErrors.body} isRequired>
          <Textarea
            {...fieldControlProps('body', save.fieldErrors.body, true)}
            value={form.body}
            onChange={(event) => setField('body', event.target.value)}
            className='min-h-40'
          />
        </FormField>
        <FormField id='category' label='Category' description='Optional. For example Exams, Holiday or Events.' error={save.fieldErrors.category}>
          <Input
            {...fieldControlProps('category', save.fieldErrors.category, true)}
            value={form.category}
            onChange={(event) => setField('category', event.target.value)}
            autoComplete='off'
            className='sm:w-64'
          />
        </FormField>
        <NoticeAudiencePicker id='audiences' value={form.audiences} onChange={setAudiences} error={audienceError(save.fieldErrors)} isDisabled={save.isPending} />
        <FormAlert tone='info'>You can change the content and audience while it is a draft. Once published, it is locked.</FormAlert>
      </FormDialog>
    </>
  );
}
