'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/helpers/format';
import type { IssuedSetupCode } from '@/types/account-setup';

interface SetupCodeDialogProps {
  /** THE JUST-ISSUED CODE. THE DIALOG IS OPEN WHILE THIS IS SET. */
  setupCode: IssuedSetupCode | null;
  personName: string;
  onClose: () => void;
  /** EXTRA GUIDANCE BELOW THE INSTRUCTIONS, E.G. THE NEXT STEP AFTER ADDING A STUDENT. */
  note?: React.ReactNode;
}

/**
 * SHOWS A NEWLY ISSUED SETUP CODE, ONCE. THE SERVER NEVER RETURNS IT AGAIN, SO A
 * CLICK OUTSIDE DOES NOT CLOSE THE DIALOG; "DONE" (OR ESCAPE) DOES.
 */
export function SetupCodeDialog({ setupCode, personName, onClose, note }: SetupCodeDialogProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isCopyFailed, setIsCopyFailed] = useState(false);

  // THE DIALOG ONLY RENDERS ITS CONTENT IN THE BROWSER, WHERE `window` EXISTS.
  const setupAddress = typeof window === 'undefined' ? ROUTES.adminAccountSetup : `${window.location.origin}${ROUTES.adminAccountSetup}`;

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) return;
    setIsCopied(false);
    setIsCopyFailed(false);
    onClose();
  }

  async function copyCode() {
    if (!setupCode) return;
    try {
      await navigator.clipboard.writeText(setupCode.code);
      setIsCopied(true);
      setIsCopyFailed(false);
    } catch {
      setIsCopied(false);
      setIsCopyFailed(true);
    }
  }

  return (
    <Dialog open={setupCode !== null} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className='text-xl font-semibold'>Setup code for {personName}</DialogTitle>
          <DialogDescription className='text-base text-muted-foreground'>
            Give this code to {personName}. It works once and expires on <span className='font-mono'>{formatDateTime(setupCode?.expiresAt)}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-2'>
          <p
            aria-label='Setup code'
            className='border bg-surface-muted px-4 py-5 text-center font-mono text-2xl font-semibold tracking-[0.2em] break-all text-foreground select-all sm:text-3xl'
          >
            {setupCode?.code}
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <Button type='button' variant='outline' size='sm' onClick={copyCode}>
              {isCopied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
              {isCopied ? 'Copied' : 'Copy code'}
            </Button>
            <span role='status' className='text-sm text-muted-foreground'>
              {isCopied && 'Copied to the clipboard.'}
              {isCopyFailed && "Couldn't copy automatically. Select the code and copy it by hand."}
            </span>
          </div>
        </div>

        <ol className='flex list-decimal flex-col gap-1.5 pl-5 text-sm text-foreground'>
          <li>
            They open <span className='font-mono break-all'>{setupAddress}</span>
          </li>
          <li>They enter their email and this code.</li>
          <li>They choose a password.</li>
        </ol>

        <FormAlert tone='info'>This code will not be shown again. If it is lost, issue a new one from their profile.</FormAlert>

        {note}

        <DialogFooter>
          <Button type='button' onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
