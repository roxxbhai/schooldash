'use client';

import { ChevronsUpDownIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { API_PATHS } from '@/constants/api-client';
import { toSearchTerm } from '@/helpers/api-client';
import { cn } from '@/helpers/cn';
import { useApiQuery } from '@/hooks/use-api-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { PaginatedList } from '@/types/api';
import type { Student } from '@/types/students';

/** HOW MANY MATCHES ONE SEARCH SHOWS; NARROW THE SEARCH TO FIND OTHERS. */
const RESULT_LIMIT = 20;

interface StudentPickerProps {
  /** THE CHOSEN STUDENT'S ID. */
  value: string | null;
  onChange: (student: Student | null) => void;
  /** STUDENTS TO HIDE FROM THE RESULTS, E.G. THOSE ALREADY ENROLLED. */
  excludeIds?: ReadonlySet<string>;
  /** SHOWN WHEN EVERY MATCH IS HIDDEN BY `excludeIds`. */
  allExcludedMessage?: string;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  id?: string;
  /** ACCEPTED SO fieldControlProps() CAN BE SPREAD; A BUTTON HAS NO FORM VALUE. */
  name?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * A SEARCHABLE COMBOBOX OF ACTIVE STUDENTS (ADMISSION NUMBER, NAME OR EMAIL).
 * THE SERVER DOES THE SEARCH; cmdk ONLY HANDLES THE KEYBOARD. A `value` SET FROM
 * OUTSIDE (E.G. A LINK) IS LOOKED UP BY ID SO THE TRIGGER CAN NAME THE STUDENT.
 */
export function StudentPicker({
  value,
  onChange,
  excludeIds,
  allExcludedMessage = 'Every match is already enrolled.',
  placeholder = 'Search for a student',
  isDisabled = false,
  className,
  id,
  name,
  ...aria
}: StudentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Student | null>(null);

  const searchTerm = toSearchTerm(search);
  const debouncedSearch = useDebouncedValue(searchTerm);
  const results = useApiQuery<PaginatedList<Student>>(debouncedSearch ? API_PATHS.students : null, {
    search: debouncedSearch,
    isActive: true,
    limit: RESULT_LIMIT,
  });
  // A VALUE THAT DIDN'T COME FROM THIS PICKER: LOAD THAT ONE STUDENT FOR ITS NAME.
  const isPickedValue = value !== null && picked?.id === value;
  const external = useApiQuery<Student>(value !== null && !isPickedValue ? `${API_PATHS.students}/${encodeURIComponent(value)}` : null);

  const selected = isPickedValue ? picked : value !== null ? external.data : null;
  const isSearching = searchTerm !== '' && (searchTerm !== debouncedSearch || results.isLoading);
  const items = (results.data?.items ?? []).filter((student) => !excludeIds?.has(student.id) || student.id === value);
  const hiddenCount = (results.data?.items.length ?? 0) - items.length;

  function triggerText() {
    if (selected) return selected.user.fullName;
    if (value !== null && external.isLoading) return 'Loading student…';
    if (value !== null && external.errorMessage) return 'Student not found';
    return placeholder;
  }

  function handleSelect(student: Student) {
    setPicked(student);
    onChange(student);
    setIsOpen(false);
    setSearch('');
  }

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) setSearch('');
  }

  function renderStatus() {
    if (!searchTerm) return <p className='px-3 py-6 text-center text-sm text-muted-foreground'>Type a name, admission number or email.</p>;
    if (isSearching && !results.data) {
      return (
        <p role='status' className='flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground'>
          <Loader2Icon className='size-4 animate-spin' aria-hidden />
          Searching…
        </p>
      );
    }
    if (results.errorMessage) {
      return (
        <div role='alert' className='flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-destructive'>
          {results.errorMessage}
          <Button type='button' variant='outline' size='sm' onClick={results.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </div>
      );
    }
    if (items.length === 0 && !isSearching) {
      return (
        <p className='px-3 py-6 text-center text-sm text-muted-foreground'>
          {hiddenCount > 0 ? allExcludedMessage : `No active students match "${searchTerm}".`}
        </p>
      );
    }
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          {...aria}
          id={id}
          name={name}
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={isOpen}
          disabled={isDisabled}
          className={cn('w-full justify-between px-3 font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className='truncate'>{triggerText()}</span>
          {selected && <span className='ml-auto tabular-nums text-xs text-muted-foreground'>{selected.admissionNumber}</span>}
          <ChevronsUpDownIcon className='text-muted-foreground' aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-(--radix-popover-trigger-width) min-w-72 p-0'>
        <Command shouldFilter={false} label='Students'>
          <CommandInput value={search} onValueChange={setSearch} placeholder='Name, admission number or email' maxLength={50} />
          <CommandList aria-busy={isSearching}>
            {renderStatus()}
            {searchTerm !== '' &&
              !results.errorMessage &&
              items.map((student) => (
                <CommandItem
                  key={student.id}
                  value={student.id}
                  onSelect={() => handleSelect(student)}
                  data-checked={student.id === value}
                  className={cn(isSearching && 'opacity-60')}
                >
                  <span className='min-w-0 flex-1 truncate'>{student.user.fullName}</span>
                  <span className='tabular-nums text-xs text-muted-foreground'>{student.admissionNumber}</span>
                </CommandItem>
              ))}
          </CommandList>
          {searchTerm !== '' && (results.data?.pagination.total ?? 0) > RESULT_LIMIT && (
            <p className='border-t px-3 py-2 text-xs text-muted-foreground'>Showing the first {RESULT_LIMIT} matches. Type more to narrow the search.</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
