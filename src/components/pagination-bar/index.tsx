'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/helpers/format';
import type { PaginationMeta } from '@/types/api';

interface PaginationBarProps {
  pagination: PaginationMeta | null;
  onPageChange: (page: number) => void;
  isDisabled?: boolean;
  /** "students", "records" … */
  noun?: string;
}

/** "41–60 of 213 students" WITH PREVIOUS/NEXT. HIDDEN WHEN THERE IS ONLY ONE PAGE. */
export function PaginationBar({ pagination, onPageChange, isDisabled = false, noun = 'records' }: PaginationBarProps) {
  if (!pagination || pagination.total === 0) return null;

  const first = (pagination.page - 1) * pagination.limit + 1;
  const last = Math.min(pagination.page * pagination.limit, pagination.total);
  const isFirstPage = pagination.page <= 1;
  const isLastPage = pagination.page >= pagination.totalPages;

  function goToPrevious() {
    onPageChange(pagination ? pagination.page - 1 : 1);
  }

  function goToNext() {
    onPageChange(pagination ? pagination.page + 1 : 1);
  }

  return (
    <nav aria-label='Pagination' className='flex items-center justify-between gap-4 border-t px-4 py-3'>
      <p className='text-sm text-muted-foreground tabular-nums'>
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(pagination.total)} {noun}
      </p>
      {pagination.totalPages > 1 && (
        <div className='flex items-center gap-2'>
          <span className='hidden text-sm text-muted-foreground tabular-nums sm:inline'>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button variant='outline' size='icon-sm' onClick={goToPrevious} disabled={isDisabled || isFirstPage} aria-label='Previous page'>
            <ChevronLeftIcon />
          </Button>
          <Button variant='outline' size='icon-sm' onClick={goToNext} disabled={isDisabled || isLastPage} aria-label='Next page'>
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </nav>
  );
}
