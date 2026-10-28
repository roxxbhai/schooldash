'use client';

import { MegaphoneIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { loadNotice } from '@/functions/notice-reader';
import { formatDateTime } from '@/helpers/format';
import { useAsyncResult } from '@/hooks/use-async-result';

interface NoticeReaderProps {
  /** THE NOTICE LIST TO RETURN TO, E.G. "/student/notices". */
  listPath: string;
}

/** ONE NOTICE, READ-ONLY. A NOTICE THE PERSON MAY NOT SEE LOOKS EXACTLY LIKE ONE THAT DOESN'T EXIST. */
export function NoticeReader({ listPath }: NoticeReaderProps) {
  const { id } = useParams<{ id: string }>();

  function load(signal: AbortSignal) {
    return loadNotice(id, signal);
  }

  const notice = useAsyncResult(`notice|${id}`, load);

  if (notice.isInitialLoading) {
    return (
      <>
        <BackLink href={listPath} label='Notices' />
        <div className='rounded-xl bg-card shadow-xs'>
          <ListSkeleton rows={3} />
        </div>
      </>
    );
  }

  if (notice.errorMessage) {
    return (
      <>
        <BackLink href={listPath} label='Notices' />
        <FormAlert tone='error' title="This notice couldn't be loaded">
          <span>{notice.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={notice.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!notice.data) {
    return (
      <>
        <BackLink href={listPath} label='Notices' />
        <div className='rounded-xl bg-card shadow-xs'>
          <EmptyState
            icon={MegaphoneIcon}
            title='Notice not found'
            description="This notice doesn't exist, or it isn't addressed to you."
            action={
              <Button asChild variant='outline'>
                <Link href={listPath}>Back to notices</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink href={listPath} label='Notices' />
      <article className='max-w-3xl rounded-xl bg-card shadow-xs'>
        <header className='border-b px-6 py-5'>
          {notice.data.category && <StatusBadge tone='neutral'>{notice.data.category}</StatusBadge>}
          <h1 className='mt-2 text-3xl font-semibold tracking-tight text-foreground'>{notice.data.title}</h1>
          <p className='mt-1.5 tabular-nums text-xs text-muted-foreground'>Published {formatDateTime(notice.data.publishedAt)}</p>
        </header>
        <div className='px-6 py-5 text-base break-words whitespace-pre-wrap text-foreground'>{notice.data.body}</div>
      </article>
    </>
  );
}
