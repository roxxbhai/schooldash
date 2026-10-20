'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACCOUNT_SETUP_FORM_SCHEMA, AUTH_ERROR_TITLES, DEFAULT_AUTH_ERROR_TITLE, MIN_PASSWORD_LENGTH } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES, SIGN_IN_REASONS } from '@/constants/routes';
import { completeAccountSetup } from '@/functions/auth';
import { toFieldErrors } from '@/helpers/api-client';
import { fieldControlProps, focusFirstInvalidField, withoutKey, zodFieldErrors } from '@/helpers/forms';
import type { FieldErrors } from '@/types/api-client';

type SetupField = 'email' | 'code' | 'password' | 'confirmPassword';

const EMPTY_FORM: Record<SetupField, string> = { email: '', code: '', password: '', confirmPassword: '' };

/** FIRST-TIME SETUP (OR AN ADMIN-ISSUED RESET): EMAIL + ONE-TIME CODE + NEW PASSWORD, THEN SIGNED IN. */
export function AccountSetupForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function updateField(field: SetupField) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = ACCOUNT_SETUP_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      setFormError(null);
      setFieldErrors(zodFieldErrors(parsed.error));
      requestAnimationFrame(() => focusFirstInvalidField(formRef.current));
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    const { email, code, password } = parsed.data;
    const result = await completeAccountSetup({ email, code, password });

    if (result.success) {
      if (result.data.isSignedIn && result.data.profile) {
        toast.success('Your password is set. Welcome to the school portal.');
        router.replace(ROLE_HOME_PATHS[result.data.profile.role]);
        router.refresh();
        return;
      }
      router.replace(`${ROUTES.signIn}?reason=${SIGN_IN_REASONS.passwordSet}`);
      return;
    }

    setIsSubmitting(false);
    setFieldErrors(toFieldErrors(result.data));
    setFormError({ title: AUTH_ERROR_TITLES[result.data.code] ?? DEFAULT_AUTH_ERROR_TITLE, message: result.message });
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      {formError && (
        <FormAlert tone='error' title={formError.title}>
          {formError.message}
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
          value={form.email}
          onChange={updateField('email')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        id='code'
        label='Setup code'
        description='12 letters and numbers from the school office. Dashes and spaces are optional.'
        error={fieldErrors.code}
      >
        <Input
          {...fieldControlProps('code', fieldErrors.code, true)}
          autoComplete='one-time-code'
          autoCapitalize='characters'
          spellCheck={false}
          placeholder='XXXX-XXXX-XXXX'
          className='font-mono tracking-[0.12em] uppercase placeholder:tracking-[0.12em]'
          value={form.code}
          onChange={updateField('code')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        id='password'
        label='New password'
        description={`At least ${MIN_PASSWORD_LENGTH} characters. A short sentence is easy to remember and hard to guess.`}
        error={fieldErrors.password}
      >
        <PasswordInput
          {...fieldControlProps('password', fieldErrors.password, true)}
          autoComplete='new-password'
          value={form.password}
          onChange={updateField('password')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField id='confirmPassword' label='Confirm new password' error={fieldErrors.confirmPassword}>
        <PasswordInput
          {...fieldControlProps('confirmPassword', fieldErrors.confirmPassword)}
          autoComplete='new-password'
          value={form.confirmPassword}
          onChange={updateField('confirmPassword')}
          disabled={isSubmitting}
        />
      </FormField>

      <Button type='submit' size='lg' className='mt-1 w-full' disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2Icon className='animate-spin' aria-hidden />
            Setting up…
          </>
        ) : (
          'Set password and sign in'
        )}
      </Button>
    </form>
  );
}
