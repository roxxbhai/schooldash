'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/helpers/cn';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

/** A LABELLED SEARCH BOX WITH A CLEAR BUTTON. THE PARENT DEBOUNCES BEFORE QUERYING. */
export function SearchInput({ value, onChange, label, placeholder, className }: SearchInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  function clear() {
    onChange('');
  }

  return (
    <InputGroup className={cn('w-full sm:w-72', className)}>
      <InputGroupAddon>
        <SearchIcon aria-hidden />
      </InputGroupAddon>
      <InputGroupInput type='search' aria-label={label} placeholder={placeholder ?? label} value={value} onChange={handleChange} maxLength={50} />
      {value && (
        <InputGroupAddon align='inline-end'>
          <InputGroupButton size='icon-xs' aria-label='Clear search' onClick={clear}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
