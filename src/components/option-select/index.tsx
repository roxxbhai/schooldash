'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/helpers/cn';
import type { SelectOption } from '@/types/reference-labels';

/** RADIX SELECT CANNOT HOLD AN EMPTY STRING, SO "NONE" / "ALL" USES THIS SENTINEL INTERNALLY. */
const EMPTY_VALUE = '__none__';

interface OptionSelectProps {
  id?: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
  options: readonly SelectOption[];
  placeholder: string;
  /** ADDS A FIRST OPTION THAT CLEARS THE VALUE, E.G. "No class teacher" OR "All classes". */
  emptyLabel?: string;
  isDisabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** A SELECT OVER PLAIN { value, label } OPTIONS, USED FOR FILTERS AND FORM FIELDS ALIKE. */
export function OptionSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  emptyLabel,
  isDisabled = false,
  className,
  ...aria
}: OptionSelectProps) {
  function handleValueChange(next: string) {
    onValueChange(next === EMPTY_VALUE ? null : next);
  }

  return (
    <Select value={value ?? (emptyLabel ? EMPTY_VALUE : '')} onValueChange={handleValueChange} disabled={isDisabled}>
      <SelectTrigger id={id} className={cn('w-full', className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position='popper' className='max-h-80'>
        {emptyLabel && <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
