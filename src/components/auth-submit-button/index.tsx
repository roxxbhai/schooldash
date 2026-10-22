import { ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { ButtonLabel } from '@/components/button-label';
import { Button } from '@/components/ui/button';

interface AuthSubmitButtonProps {
  isSubmitting: boolean;
  label: string;
  pendingLabel: string;
}

/** THE FULL-WIDTH SUBMIT BUTTON OF EVERY AUTH FORM, WITH ITS PENDING STATE. */
export function AuthSubmitButton({ isSubmitting, label, pendingLabel }: AuthSubmitButtonProps) {
  return (
    <Button type='submit' size='lg' className='mt-1 w-full' disabled={isSubmitting}>
      <ButtonLabel stateKey={isSubmitting ? 'pending' : 'idle'}>
        {isSubmitting ? (
          <>
            <Loader2Icon className='animate-spin' aria-hidden />
            {pendingLabel}
          </>
        ) : (
          <>
            {label}
            <ArrowRightIcon aria-hidden />
          </>
        )}
      </ButtonLabel>
    </Button>
  );
}
