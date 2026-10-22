'use client';

import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import { AttendanceStatusToggle } from '@/components/attendance-status-toggle';
import { FormAlert } from '@/components/form-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ATTENDANCE_REMARKS_MAX_LENGTH, ATTENDANCE_ROW_STATE_BADGES } from '@/constants/admin-attendance';
import { cn } from '@/helpers/cn';
import type { AttendanceRegisterRow, AttendanceStatus } from '@/types/admin-attendance';

interface AttendanceRegisterProps {
  /** NAMES THE LIST FOR SCREEN READERS. */
  label: string;
  /** HEADER OF THE LEADING COLUMN (E.G. "Roll"); OMIT FOR NO LEADING COLUMN. */
  leadingHeader?: string;
  nameHeader: string;
  rows: readonly AttendanceRegisterRow[] | null;
  isLoading: boolean;
  isDisabled: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  empty: React.ReactNode;
  onStatusChange: (row: AttendanceRegisterRow, status: AttendanceStatus) => void;
  onRemarksChange: (row: AttendanceRegisterRow, remarks: string) => void;
}

const SKELETON_ROWS = 6;

/**
 * A DAILY REGISTER: ONE ROW PER PERSON WITH A STATUS TOGGLE, AN OPTIONAL NOTE
 * AND WHETHER THE ROW IS SAVED. A GRID ON WIDE SCREENS, STACKED CARDS ON PHONES.
 */
export function AttendanceRegister({
  label,
  leadingHeader,
  nameHeader,
  rows,
  isLoading,
  isDisabled,
  errorMessage,
  onRetry,
  empty,
  onStatusChange,
  onRemarksChange,
}: AttendanceRegisterProps) {
  const hasLeading = Boolean(leadingHeader);
  const gridClassName = hasLeading
    ? 'md:grid-cols-[4rem_minmax(10rem,1fr)_minmax(19rem,22rem)_minmax(10rem,16rem)_6.5rem]'
    : 'md:grid-cols-[minmax(10rem,1fr)_minmax(19rem,22rem)_minmax(10rem,16rem)_6.5rem]';
  const isFirstLoad = isLoading && rows === null;

  return (
    <div className='border bg-card shadow-xs'>
      {errorMessage && (
        <div className='border-b p-4'>
          <FormAlert tone='error' title="Couldn't load this register">
            <span>{errorMessage}</span>
            <Button variant='outline' size='sm' className='mt-2 flex' onClick={onRetry}>
              <RefreshCwIcon aria-hidden />
              Try again
            </Button>
          </FormAlert>
        </div>
      )}

      <div className={cn(isLoading && rows !== null && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
        <div
          aria-hidden
          className={cn('hidden gap-4 border-b bg-surface-muted px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid', gridClassName)}
        >
          {hasLeading && <span>{leadingHeader}</span>}
          <span>{nameHeader}</span>
          <span>Status</span>
          <span>Note</span>
          <span className='text-right'>State</span>
        </div>

        {isFirstLoad && (
          <ul aria-label={label} className='divide-y'>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={`skeleton-${index}`} className={cn('grid gap-3 px-4 py-3 md:items-center md:gap-4', gridClassName)}>
                {hasLeading && <Skeleton className='hidden h-4 w-8 md:block' />}
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-11 w-full' />
                <Skeleton className='h-9 w-full' />
                <Skeleton className='hidden h-5 w-16 justify-self-end md:block' />
              </li>
            ))}
          </ul>
        )}

        {rows && rows.length > 0 && (
          <ul aria-label={label} className='divide-y'>
            {rows.map((row) => {
              const badge = ATTENDANCE_ROW_STATE_BADGES[row.state];
              const errorId = `attendance-error-${row.id}`;
              const remarksId = `attendance-remarks-${row.id}`;
              const isRowDisabled = isDisabled || row.lockedReason !== null;
              return (
                <li
                  key={row.id}
                  className={cn('grid gap-3 px-4 py-3 md:items-center md:gap-4', gridClassName, row.errorMessage && 'bg-destructive-soft/60')}
                >
                  {hasLeading && (
                    <span className='hidden text-sm text-muted-foreground tabular-nums md:block'>{row.leading ?? '—'}</span>
                  )}

                  <div className='flex min-w-0 items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium text-foreground'>
                        {hasLeading && <span className='mr-2 tabular-nums text-sm text-muted-foreground md:hidden'>{row.leading ?? '—'}</span>}
                        {row.name}
                      </p>
                      <p className='truncate tabular-nums text-xs text-muted-foreground'>{row.code}</p>
                      {row.lockedReason && <p className='mt-0.5 text-xs text-muted-foreground'>{row.lockedReason}</p>}
                    </div>
                    <StatusBadge tone={badge.tone} className='shrink-0 md:hidden'>
                      {badge.label}
                    </StatusBadge>
                  </div>

                  <AttendanceStatusToggle
                    label={`Attendance for ${row.name}`}
                    value={row.draft.status}
                    onValueChange={(status) => onStatusChange(row, status)}
                    isDisabled={isRowDisabled}
                    isInvalid={Boolean(row.errorMessage)}
                  />

                  <div className='min-w-0'>
                    <label htmlFor={remarksId} className='sr-only'>
                      {`Note for ${row.name}`}
                    </label>
                    <Input
                      id={remarksId}
                      value={row.draft.remarks}
                      onChange={(event) => onRemarksChange(row, event.target.value)}
                      placeholder='Note (optional)'
                      maxLength={ATTENDANCE_REMARKS_MAX_LENGTH}
                      disabled={isRowDisabled}
                      aria-invalid={row.errorMessage ? true : undefined}
                      aria-describedby={row.errorMessage ? errorId : undefined}
                      autoComplete='off'
                      className='h-11 md:h-9'
                    />
                  </div>

                  <div className='hidden justify-end md:flex'>
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  </div>

                  {row.errorMessage && (
                    <p id={errorId} role='alert' className='flex items-start gap-1.5 text-sm text-destructive md:col-span-full'>
                      <CircleAlertIcon aria-hidden className='mt-0.5 size-4 shrink-0' />
                      {row.errorMessage}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {rows !== null && rows.length === 0 && !errorMessage && empty}
      </div>
    </div>
  );
}
