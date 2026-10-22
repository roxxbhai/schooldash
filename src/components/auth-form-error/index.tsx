import Link from 'next/link';
import { FormAlert } from '@/components/form-alert';
import type { AuthFormError as AuthFormErrorValue } from '@/types/auth-forms';

interface AuthFormErrorProps {
  error: AuthFormErrorValue | null;
  /** A NEXT STEP AFTER THE MESSAGE FOR ONE ERROR CODE, E.G. "SIGN UP" AFTER WRONG CREDENTIALS. */
  nextStep?: { code: string; prompt: string; label: string; href: string };
}

/** THE ONE MESSAGE ABOVE A FAILED AUTH FORM: WHAT WENT WRONG, AND WHERE USEFUL, WHAT TO DO NEXT. */
export function AuthFormError({ error, nextStep }: AuthFormErrorProps) {
  if (!error) return null;

  return (
    <FormAlert tone='error' title={error.title}>
      {error.message}
      {nextStep?.code === error.code && (
        <>
          {' '}
          {nextStep.prompt}{' '}
          <Link href={nextStep.href} className='font-medium text-primary underline underline-offset-3'>
            {nextStep.label}
          </Link>
          .
        </>
      )}
    </FormAlert>
  );
}
