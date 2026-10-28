'use client';

import { Loader2Icon } from 'lucide-react';
import { FormAlert } from '@/components/form-alert';
import { ButtonLabel } from '@/components/button-label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/helpers/cn';

interface FormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  isSubmitting: boolean;
  /** A FAILURE THAT ISN'T TIED TO ONE FIELD (CONFLICT, PERMISSION, OUTAGE). */
  formError?: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** E.G. WHILE THE FORM HAS NOTHING IT COULD SUBMIT. */
  isSubmitDisabled?: boolean;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * A CREATE/EDIT FORM IN A DIALOG. IT CANNOT BE DISMISSED WHILE SAVING, AND THE
 * SUBMIT BUTTON IS DISABLED UNTIL THE SERVER ANSWERS, SO NOTHING IS SENT TWICE.
 */
export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  submitLabel,
  isSubmitting,
  formError,
  onSubmit,
  isSubmitDisabled = false,
  size = 'md',
  children,
}: FormDialogProps) {
  function handleOpenChange(nextIsOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextIsOpen);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={cn('scrollbar-subtle max-h-[calc(100dvh-2rem)] overflow-y-auto', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <form noValidate onSubmit={onSubmit} aria-busy={isSubmitting} className='flex flex-col gap-5'>
          <DialogHeader>
            <DialogTitle className='text-xl font-semibold'>{title}</DialogTitle>
            {description && <DialogDescription className='text-base text-muted-foreground'>{description}</DialogDescription>}
          </DialogHeader>
          {formError && (
            <FormAlert tone='error' title="Couldn't save">
              {formError}
            </FormAlert>
          )}
          <div className='flex flex-col gap-4'>{children}</div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting || isSubmitDisabled}>
              <ButtonLabel stateKey={isSubmitting ? 'pending' : 'idle'}>
                {isSubmitting && <Loader2Icon className='animate-spin' aria-hidden />}
                {submitLabel}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
