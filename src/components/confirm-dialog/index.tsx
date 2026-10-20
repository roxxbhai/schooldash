'use client';

import { Loader2Icon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** DESTRUCTIVE ACTIONS ARE RED. */
  tone?: 'default' | 'destructive';
  isPending?: boolean;
  /** WHY THE LAST ATTEMPT FAILED, SHOWN INSIDE THE DIALOG. */
  errorMessage?: string | null;
  onConfirm: () => void;
}

/** ASKS BEFORE A CONSEQUENTIAL ACTION. STAYS OPEN WHILE THE REQUEST RUNS; THE CALLER CLOSES IT ON SUCCESS. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  isPending = false,
  errorMessage,
  onConfirm,
}: ConfirmDialogProps) {
  function handleOpenChange(nextIsOpen: boolean) {
    if (isPending) return;
    onOpenChange(nextIsOpen);
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className='text-xl font-semibold'>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className='text-base text-muted-foreground'>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage && (
          <FormAlert tone='error' title="Couldn't complete this">
            {errorMessage}
          </FormAlert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            className={tone === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2Icon className='animate-spin' aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
