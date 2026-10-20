'use client';

import { RefreshCwIcon } from 'lucide-react';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/helpers/cn';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** E.G. 'w-32' OR 'hidden md:table-cell' (APPLIED TO BOTH HEADER AND CELLS). */
  className?: string;
}

interface DataTableProps<T> {
  /** NAMES THE TABLE FOR SCREEN READERS. */
  label: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[] | null;
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  empty: React.ReactNode;
  footer?: React.ReactNode;
  /** PADDING ROWS SHOWN BEFORE THE FIRST ANSWER. */
  skeletonRows?: number;
}

/**
 * THE PORTAL'S ONE TABLE: LOADING, ERROR AND EMPTY STATES BUILT IN. WIDE TABLES
 * SCROLL SIDEWAYS ON SMALL SCREENS; LOW-PRIORITY COLUMNS CAN HIDE VIA `className`.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  getRowKey,
  isLoading = false,
  errorMessage = null,
  onRetry,
  empty,
  footer,
  skeletonRows = 6,
}: DataTableProps<T>) {
  const isFirstLoad = isLoading && rows === null;

  return (
    <div className='border bg-card shadow-xs'>
      {errorMessage && (
        <div className='border-b p-4'>
          <FormAlert tone='error' title="Couldn't load this list">
            <span>{errorMessage}</span>
            {onRetry && (
              <Button variant='outline' size='sm' className='mt-2 flex' onClick={onRetry}>
                <RefreshCwIcon aria-hidden />
                Try again
              </Button>
            )}
          </FormAlert>
        </div>
      )}

      <div className={cn('relative overflow-x-auto', isLoading && rows !== null && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
        <Table aria-label={label}>
          <TableHeader className='bg-surface-muted'>
            <TableRow className='hover:bg-transparent'>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn('h-10 px-4 text-xs font-medium text-muted-foreground', column.align === 'right' && 'text-right', column.className)}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isFirstLoad &&
              Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className='hover:bg-transparent'>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn('h-12 px-4', column.className)}>
                      <Skeleton className='h-4 w-full max-w-40' />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {rows?.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn('h-12 px-4 align-middle', column.align === 'right' && 'text-right', column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows !== null && rows.length === 0 && !errorMessage && empty}
      </div>

      {footer}
    </div>
  );
}

