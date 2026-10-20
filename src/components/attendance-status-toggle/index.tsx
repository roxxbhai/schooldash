'use client';

import { ATTENDANCE_STATUS_OPTIONS, ATTENDANCE_TONE_SELECTED_CLASSES } from '@/constants/admin-attendance';
import { cn } from '@/helpers/cn';
import type { AttendanceStatus } from '@/types/admin-attendance';

interface AttendanceStatusToggleProps {
  value: AttendanceStatus | null;
  onValueChange: (value: AttendanceStatus) => void;
  /** NAMES THE GROUP FOR SCREEN READERS, E.G. "Attendance for Asha Verma". */
  label: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  className?: string;
}

/**
 * PRESENT / ABSENT / LATE / ON LEAVE AS A RADIO GROUP OF SQUARE BUTTONS. ONE TAB
 * STOP: THE ARROW KEYS (AND HOME / END) MOVE AND CHOOSE, LIKE NATIVE RADIOS.
 */
export function AttendanceStatusToggle({ value, onValueChange, label, isDisabled = false, isInvalid = false, className }: AttendanceStatusToggleProps) {
  const focusIndex = Math.max(
    0,
    ATTENDANCE_STATUS_OPTIONS.findIndex((option) => option.value === value),
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const lastIndex = ATTENDANCE_STATUS_OPTIONS.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = focusIndex === lastIndex ? 0 : focusIndex + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = focusIndex === 0 ? lastIndex : focusIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }
    event.preventDefault();
    onValueChange(ATTENDANCE_STATUS_OPTIONS[nextIndex].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
  }

  return (
    <div
      role='radiogroup'
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      aria-invalid={isInvalid || undefined}
      onKeyDown={isDisabled ? undefined : handleKeyDown}
      className={cn('grid grid-cols-4 gap-1', className)}
    >
      {ATTENDANCE_STATUS_OPTIONS.map((option, index) => {
        const isChecked = option.value === value;
        return (
          <button
            key={option.value}
            type='button'
            role='radio'
            aria-checked={isChecked}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={isDisabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'flex min-h-11 min-w-0 items-center justify-center border px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none sm:px-3 sm:text-sm',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isChecked ? ATTENDANCE_TONE_SELECTED_CLASSES[option.tone] : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
