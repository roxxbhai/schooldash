'use client';

import { ArrowRightIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUTH_ERROR_TITLES, DEFAULT_AUTH_ERROR_TITLE, SIGN_IN_FORM_SCHEMA } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES } from '@/constants/routes';
import { signIn } from '@/functions/auth';
import { toFieldErrors } from '@/helpers/api-client';
import { fieldControlProps, focusFirstInvalidField, withoutKey, zodFieldErrors } from '@/helpers/forms';
import type { FieldErrors } from '@/types/api-client';

interface FormError {
  title: string;
  message: string;
  isCredentialError: boolean;
}

/** EMAIL + PASSWORD SIGN-IN AGAINST POST /api/auth/login. THE SERVER DECIDES THE ROLE AND WHERE IT LEADS. */
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = SIGN_IN_FORM_SCHEMA.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(null);
      setFieldErrors(zodFieldErrors(parsed.error));
      requestAnimationFrame(() => focusFirstInvalidField(formRef.current));
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    const result = await signIn(parsed.data);

    if (result.success) {
      // STAY IN THE SUBMITTING STATE WHILE THE NEXT PAGE LOADS, SO THE FORM CANNOT BE SENT TWICE.
      router.replace(ROLE_HOME_PATHS[result.data.role]);
      router.refresh();
      return;
    }

    setIsSubmitting(false);
    setFieldErrors(toFieldErrors(result.data));
    setFormError({
      title: AUTH_ERROR_TITLES[result.data.code] ?? DEFAULT_AUTH_ERROR_TITLE,
      message: result.message,
      isCredentialError: result.data.code === 'INVALID_CREDENTIALS',
    });
  }

  function handleEmailChange(event: React.ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    setFieldErrors((errors) => withoutKey(errors, 'email'));
  }

  function handlePasswordChange(event: React.ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value);
    setFieldErrors((errors) => withoutKey(errors, 'password'));
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      {formError && (
        <FormAlert tone='error' title={formError.title}>
          {formError.message}
          {formError.isCredentialError && (
            <>
              {' '}
              New to the portal?{' '}
              <Link href={ROUTES.accountSetup} className='font-medium text-primary underline underline-offset-3'>
                Set up your account
              </Link>{' '}
              with the code from the school office.
            </>
          )}
        </FormAlert>
      )}

      <FormField id='email' label='Email address' error={fieldErrors.email}>
        <Input
          {...fieldControlProps('email', fieldErrors.email)}
          type='email'
          inputMode='email'
          autoComplete='username'
          autoCapitalize='none'
          spellCheck={false}
          placeholder='name@example.com'
          value={email}
          onChange={handleEmailChange}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField id='password' label='Password' error={fieldErrors.password}>
        <PasswordInput
          {...fieldControlProps('password', fieldErrors.password)}
          autoComplete='current-password'
          value={password}
          onChange={handlePasswordChange}
          disabled={isSubmitting}
        />
      </FormField>

      <Button type='submit' size='lg' className='mt-1 w-full' disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2Icon className='animate-spin' aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRightIcon aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
