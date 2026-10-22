'use client';

import { CheckCheckIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { formatNumber, pluralize } from '@/helpers/format';
import type { AttendanceCounts } from '@/types/admin-attendance';

interface AttendanceToolbarProps {
  counts: AttendanceCounts;
  /** HOW MANY ROWS WOULD BE SAVED (NEW + CORRECTED). */
  pendingCount: number;
  isSaving: boolean;
  isDisabled: boolean;
  onMarkRemainingPresent: () => void;
  onReset: () => void;
  onSave: () => void;
}

/** THE REGISTER'S RUNNING TOTALS AND ITS ACTIONS. STICKS TO THE BOTTOM OF THE SCREEN ON LONG LISTS. */
export function AttendanceToolbar({ counts, pendingCount, isSaving, isDisabled, onMarkRemainingPresent, onReset, onSave }: AttendanceToolbarProps) {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const isLocked = isDisabled || isSaving;
  const saveLabel = pendingCount > 0 ? `Save ${pluralize(pendingCount, 'change')}` : 'Save';

  function confirmReset() {
    onReset();
    setIsResetConfirmOpen(false);
  }

  return (
    <div className='sticky bottom-0 z-10 mt-4 flex flex-col gap-3 border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between'>
      <ul aria-label='Totals' className='flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm'>
        {ATTENDANCE_STATUS_OPTIONS.map((option) => (
          <li key={option.value} className='flex items-center gap-1.5'>
            <StatusBadge tone={option.tone}>{option.label}</StatusBadge>
            <span className='font-mono tabular-nums'>{formatNumber(counts[option.value])}</span>
          </li>
        ))}
        <li className='flex items-center gap-1.5'>
          <StatusBadge tone='neutral'>Not marked</StatusBadge>
          <span className='font-mono tabular-nums'>{formatNumber(counts.notMarked)}</span>
        </li>
      </ul>

      <div className='flex flex-wrap items-center gap-2'>
        <Button variant='outline' className='min-h-11 md:min-h-9' onClick={onMarkRemainingPresent} disabled={isLocked || counts.notMarked === 0}>
          <CheckCheckIcon aria-hidden />
          Mark remaining as present
        </Button>
        <Button variant='ghost' className='min-h-11 md:min-h-9' onClick={() => setIsResetConfirmOpen(true)} disabled={isLocked || pendingCount === 0}>
          <RotateCcwIcon aria-hidden />
          Reset changes
        </Button>
        <Button className='min-h-11 md:min-h-9' onClick={onSave} disabled={isLocked || pendingCount === 0} aria-busy={isSaving}>
          <SaveIcon aria-hidden />
          {isSaving ? 'Saving…' : saveLabel}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onOpenChange={setIsResetConfirmOpen}
        title='Discard unsaved changes?'
        description={`${pluralize(pendingCount, 'change')} you haven't saved will be lost.`}
        confirmLabel='Discard changes'
        tone='destructive'
        onConfirm={confirmReset}
      />
    </div>
  );
}
