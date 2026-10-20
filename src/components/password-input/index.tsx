'use client';

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

/** A PASSWORD FIELD WITH A SHOW/HIDE TOGGLE. THE TOGGLE IS A REAL BUTTON WITH AN ACCESSIBLE NAME AND PRESSED STATE. */
export function PasswordInput(props: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  function toggleVisibility() {
    setIsVisible((visible) => !visible);
  }

  return (
    <InputGroup>
      <InputGroupInput {...props} type={isVisible ? 'text' : 'password'} />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          type='button'
          size='icon-xs'
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          onClick={toggleVisibility}
        >
          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
