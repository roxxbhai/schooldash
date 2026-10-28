'use client';

import { ArchiveIcon, ArrowLeftIcon, FileQuestionIcon, PencilIcon, RefreshCwIcon, SendIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { NoticeAudiencePicker } from '@/components/notice-audience-picker';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AUDIENCE_SELECTION_SCHEMA,
  EMPTY_AUDIENCE_SELECTION,
  EMPTY_NOTICE_CONTENT,
  NOTICE_CONTENT_SCHEMA,
  NOTICE_STATUS_META,
  type NoticeContentForm,
} from '@/constants/admin-notices';
import { ROUTES } from '@/constants/routes';
import { archiveNotice, loadNotice, publishNotice, setNoticeAudiences, updateNoticeContent } from '@/functions/admin-notices';
import { audienceError, audienceLabels, audienceSummary, selectionFromAudiences } from '@/helpers/admin-notices';
import { formatDateTime } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AudienceSelection } from '@/types/admin-notices';

type NoticeTransition = 'publish' | 'archive';

function BackLink() {
  return (
    <Link href={ROUTES.admin.notices} className='mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'>
      <ArrowLeftIcon aria-hidden className='size-4' />
      All notices
    </Link>
  );
}

/**
 * ONE NOTICE: ITS CONTENT, AUDIENCE AND DATES, AND THE ACTIONS ITS STATUS ALLOWS.
 * DRAFTS CAN BE EDITED, RE-TARGETED, PUBLISHED OR ARCHIVED; PUBLISHED NOTICES ARE
 * LOCKED AND CAN ONLY BE ARCHIVED; ARCHIVED IS FINAL.
 */
export function AdminNoticeDetail() {
  const [isContentOpen, setIsContentOpen] = useState(false);
  const [contentForm, setContentForm] = useState<NoticeContentForm>(EMPTY_NOTICE_CONTENT);
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);
  const [audienceForm, setAudienceForm] = useState<AudienceSelection>(EMPTY_AUDIENCE_SELECTION);
  const [transition, setTransition] = useState<NoticeTransition | null>(null);

  const params = useParams<{ id: string }>();
  const { classById } = useReferenceData();
  const result = useAsyncResult(`notice|${params.id}`, (signal) => loadNotice(params.id, signal));

  const saveContent = useMutation((values: NoticeContentForm) => updateNoticeContent(params.id, values), {
    successMessage: 'Saved the notice.',
    onSuccess: () => {
      setIsContentOpen(false);
      result.reload();
    },
  });

  const saveAudiences = useMutation((selection: AudienceSelection) => setNoticeAudiences(params.id, selection), {
    successMessage: 'Saved the audience.',
    onSuccess: () => {
      setIsAudienceOpen(false);
      result.reload();
    },
  });

  const changeStatus = useMutation((action: NoticeTransition) => (action === 'publish' ? publishNotice(params.id) : archiveNotice(params.id)), {
    successMessage: (changed) => (changed.status === 'published' ? `Published "${changed.title}". Its audience can now read it in the portal.` : `Archived "${changed.title}".`),
    onSuccess: () => {
      setTransition(null);
      result.reload();
    },
  });

  const notice = result.data;
  const isDraft = notice?.status === 'draft';
  const isPublished = notice?.status === 'published';
  const isWithoutAudience = (notice?.audiences.length ?? 0) === 0;
  const paragraphs = notice ? notice.body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== '') : [];

  function openContent() {
    if (!notice) return;
    setContentForm({ title: notice.title, body: notice.body, category: notice.category ?? '' });
    saveContent.reset();
    setIsContentOpen(true);
  }

  function openAudience() {
    if (!notice) return;
    setAudienceForm(selectionFromAudiences(notice.audiences));
    saveAudiences.reset();
    setIsAudienceOpen(true);
  }

  function setContentField(field: keyof NoticeContentForm, value: string) {
    setContentForm((current) => ({ ...current, [field]: value }));
    saveContent.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleAudienceChange(selection: AudienceSelection) {
    setAudienceForm(selection);
    saveAudiences.setFieldErrors({});
  }

  function handleContentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = NOTICE_CONTENT_SCHEMA.safeParse(contentForm);
    if (!parsed.success) {
      saveContent.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void saveContent.run(parsed.data);
  }

  function handleAudienceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = AUDIENCE_SELECTION_SCHEMA.safeParse(audienceForm);
    if (!parsed.success) {
      saveAudiences.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void saveAudiences.run(audienceForm);
  }

  function openTransition(action: NoticeTransition) {
    changeStatus.reset();
    setTransition(action);
  }

  function closeTransition(isOpen: boolean) {
    if (isOpen) return;
    setTransition(null);
    changeStatus.reset();
  }

  function confirmTransition() {
    if (transition) void changeStatus.run(transition);
  }

  if (result.isInitialLoading) {
    return (
      <div aria-busy>
        <BackLink />
        <Skeleton className='h-9 w-2/3 max-w-lg' />
        <Skeleton className='mt-3 h-5 w-24' />
        <div className='mt-6 grid gap-4 lg:grid-cols-3'>
          <Skeleton className='h-64 lg:col-span-2' />
          <Skeleton className='h-64' />
        </div>
      </div>
    );
  }

  if (result.errorMessage) {
    return (
      <>
        <BackLink />
        <FormAlert tone='error' title="Couldn't load this notice">
          <span>{result.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={result.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!notice) {
    return (
      <>
        <BackLink />
        <EmptyState
          className='rounded-xl bg-card shadow-xs'
          icon={FileQuestionIcon}
          title='Notice not found'
          description='It may have been mistyped, or the link is out of date. Notices are never deleted, so check the full list.'
          action={
            <Button asChild variant='outline'>
              <Link href={ROUTES.admin.notices}>Go to notices</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={notice.title}
        description={
          <span className='flex flex-wrap items-center gap-2 text-sm'>
            <StatusBadge tone={NOTICE_STATUS_META[notice.status].tone}>{NOTICE_STATUS_META[notice.status].label}</StatusBadge>
            {notice.category && <span>{notice.category}</span>}
          </span>
        }
        actions={
          notice.status !== 'archived' && (
            <>
              {isDraft && (
                <>
                  <Button variant='outline' onClick={openContent}>
                    <PencilIcon aria-hidden />
                    Edit content
                  </Button>
                  <Button variant='outline' onClick={openAudience}>
                    <UsersIcon aria-hidden />
                    Edit audience
                  </Button>
                </>
              )}
              <Button variant='outline' onClick={() => openTransition('archive')}>
                <ArchiveIcon aria-hidden />
                Archive
              </Button>
              {isDraft && (
                <Button onClick={() => openTransition('publish')} disabled={isWithoutAudience} aria-describedby={isWithoutAudience ? 'publish-hint' : undefined}>
                  <SendIcon aria-hidden />
                  Publish
                </Button>
              )}
            </>
          )
        }
      />

      {isDraft && isWithoutAudience && (
        <FormAlert tone='info' className='mb-4'>
          <span id='publish-hint'>Add at least one audience before publishing. Until it is published, only admins can see this draft.</span>
        </FormAlert>
      )}
      {isDraft && !isWithoutAudience && (
        <FormAlert tone='info' className='mb-4'>
          This is a draft. Only admins can see it until you publish it.
        </FormAlert>
      )}
      {isPublished && (
        <FormAlert tone='info' title='Published notices are locked' className='mb-4'>
          Its content and audience can no longer change. To correct it, archive it and publish a new notice.
        </FormAlert>
      )}
      {notice.status === 'archived' && (
        <FormAlert tone='info' title='Archived notices are final' className='mb-4'>
          Only admins can see it now, and it can&apos;t be republished. To share it again, create a new notice.
        </FormAlert>
      )}

      <div className='grid gap-4 lg:grid-cols-3'>
        <Panel title='Notice' className='lg:col-span-2'>
          <div className='flex max-w-prose flex-col gap-4 text-base text-foreground'>
            {paragraphs.map((paragraph, index) => (
              <p key={index} className='break-words whitespace-pre-wrap'>
                {paragraph}
              </p>
            ))}
          </div>
        </Panel>

        <div className='flex flex-col gap-4'>
          <Panel title='Audience' description='Visible to everyone in any of these, once published.'>
            {isWithoutAudience ? (
              <p className='text-sm text-muted-foreground'>No audience yet.</p>
            ) : (
              <ul className='flex flex-col gap-1.5 text-sm text-foreground' aria-label={audienceSummary(notice.audiences, classById)}>
                {audienceLabels(notice.audiences, classById).map((label) => (
                  <li key={label} className='border-l-2 border-l-primary bg-surface-muted px-2.5 py-1.5'>
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title='Dates'>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
              <dt className='text-muted-foreground'>Created</dt>
              <dd className='tabular-nums'>{formatDateTime(notice.createdAt)}</dd>
              <dt className='text-muted-foreground'>Last updated</dt>
              <dd className='tabular-nums'>{formatDateTime(notice.updatedAt)}</dd>
              <dt className='text-muted-foreground'>Published</dt>
              <dd className='tabular-nums'>{notice.publishedAt ? formatDateTime(notice.publishedAt) : '—'}</dd>
            </dl>
          </Panel>
        </div>
      </div>

      <FormDialog
        isOpen={isContentOpen}
        onOpenChange={setIsContentOpen}
        title='Edit notice'
        description='Changes are saved to the draft. Nobody sees it until it is published.'
        submitLabel='Save changes'
        isSubmitting={saveContent.isPending}
        formError={saveContent.formError}
        onSubmit={handleContentSubmit}
        size='lg'
      >
        <FormField id='title' label='Title' error={saveContent.fieldErrors.title} isRequired>
          <Input
            {...fieldControlProps('title', saveContent.fieldErrors.title)}
            value={contentForm.title}
            onChange={(event) => setContentField('title', event.target.value)}
            autoComplete='off'
          />
        </FormField>
        <FormField id='body' label='Notice' description='Plain text. Line breaks are kept.' error={saveContent.fieldErrors.body} isRequired>
          <Textarea
            {...fieldControlProps('body', saveContent.fieldErrors.body, true)}
            value={contentForm.body}
            onChange={(event) => setContentField('body', event.target.value)}
            className='min-h-40'
          />
        </FormField>
        <FormField id='category' label='Category' description='Optional. Leave empty to remove it.' error={saveContent.fieldErrors.category}>
          <Input
            {...fieldControlProps('category', saveContent.fieldErrors.category, true)}
            value={contentForm.category}
            onChange={(event) => setContentField('category', event.target.value)}
            autoComplete='off'
            className='sm:w-64'
          />
        </FormField>
      </FormDialog>

      <FormDialog
        isOpen={isAudienceOpen}
        onOpenChange={setIsAudienceOpen}
        title='Edit audience'
        description='The chosen audience replaces the current one. Everyone in any of them can read the notice once it is published.'
        submitLabel='Save audience'
        isSubmitting={saveAudiences.isPending}
        formError={saveAudiences.formError}
        onSubmit={handleAudienceSubmit}
        size='lg'
      >
        <NoticeAudiencePicker
          id='audiences'
          value={audienceForm}
          onChange={handleAudienceChange}
          error={audienceError(saveAudiences.fieldErrors)}
          isDisabled={saveAudiences.isPending}
        />
      </FormDialog>

      <ConfirmDialog
        isOpen={transition === 'publish'}
        onOpenChange={closeTransition}
        title='Publish this notice?'
        description={
          <>
            <p>
              It becomes visible in the portal to: <span className='text-foreground'>{audienceSummary(notice.audiences, classById)}</span>.
            </p>
            <p className='mt-2'>Once published, it is locked. To correct it later, archive it and publish a new notice. No email or SMS is sent.</p>
          </>
        }
        confirmLabel='Publish'
        isPending={changeStatus.isPending}
        errorMessage={changeStatus.formError}
        onConfirm={confirmTransition}
      />

      <ConfirmDialog
        isOpen={transition === 'archive'}
        onOpenChange={closeTransition}
        title='Archive this notice?'
        description={
          isPublished
            ? 'Its audience will no longer see it. Archiving is final: the notice can’t be republished.'
            : 'The draft is closed without being published. Archiving is final: it can’t be edited or published afterwards.'
        }
        confirmLabel='Archive'
        tone='destructive'
        isPending={changeStatus.isPending}
        errorMessage={changeStatus.formError}
        onConfirm={confirmTransition}
      />
    </>
  );
}
