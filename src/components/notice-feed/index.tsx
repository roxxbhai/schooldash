'use client';

import { ChevronRightIcon, MegaphoneIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { API_PATHS } from '@/constants/api-client';
import { NOTICE_FEED_PAGE_SIZE } from '@/constants/notice-feed';
import { formatDate } from '@/helpers/format';
import { useApiQuery } from '@/hooks/use-api-query';
import type { PaginatedList } from '@/types/api';
import type { Notice } from '@/types/notices';

interface NoticeFeedProps {
  /** WHERE ONE NOTICE OPENS, E.G. "/student/notices"; THE NOTICE ID IS APPENDED. */
  basePath: string;
}

/**
 * READ-ONLY NOTICES FOR TEACHERS AND STUDENTS: ONLY WHAT THE API RETURNS, WHICH
 * RLS LIMITS TO PUBLISHED NOTICES ADDRESSED TO THE PERSON'S ROLE OR CLASS. NEWEST FIRST.
 */
export function NoticeFeed({ basePath }: NoticeFeedProps) {
  const [page, setPage] = useState(1);

  const list = useApiQuery<PaginatedList<Notice>>(API_PATHS.notices, { page, limit: NOTICE_FEED_PAGE_SIZE });

  const notices = list.data?.items ?? null;

  return (
    <>
      <PageHeader title='Notices' description='Notices from the school addressed to you.' />

      {list.errorMessage && (
        <FormAlert tone='error' title="Notices couldn't be loaded" className='mb-4'>
          <span>{list.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={list.reload}>
            Try again
          </Button>
        </FormAlert>
      )}

      <div className='border bg-card shadow-xs'>
        {notices === null ? (
          list.errorMessage ? null : <ListSkeleton rows={4} />
        ) : notices.length === 0 ? (
          <EmptyState icon={MegaphoneIcon} title='No notices' description='When the school publishes a notice for you, it appears here.' />
        ) : (
          <ul className='divide-y'>
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={`${basePath}/${notice.id}`}
                  className='group flex items-start gap-4 px-5 py-4 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                >
                  <span className='min-w-0 flex-1'>
                    <span className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium text-foreground group-hover:text-primary'>{notice.title}</span>
                      {notice.category && <StatusBadge tone='neutral'>{notice.category}</StatusBadge>}
                    </span>
                    <span className='mt-1 line-clamp-2 block text-sm text-muted-foreground'>{notice.body}</span>
                  </span>
                  <span className='flex shrink-0 items-center gap-2'>
                    <span className='tabular-nums text-xs text-muted-foreground'>{formatDate(notice.publishedAt)}</span>
                    <ChevronRightIcon aria-hidden className='size-4 text-muted-foreground' />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='notices' />
      </div>
    </>
  );
}
