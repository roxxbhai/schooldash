'use client';

import { AuthFormError } from '@/components/auth-form-error';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { ACCOUNT_SETUP_FORM_SCHEMA, MIN_PASSWORD_LENGTH } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES, SIGN_IN_REASONS } from '@/constants/routes';
import { completeAdminAccountSetup } from '@/functions/auth';
import { fieldControlProps } from '@/helpers/forms';
import { useAuthForm } from '@/hooks/use-auth-form';

/** A NEW ADMINISTRATOR'S SETUP (OR AN ADMIN-ISSUED RESET): EMAIL + ONE-TIME CODE + NEW PASSWORD, THEN SIGNED IN. */
export function AccountSetupForm() {
  const { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit } = useAuthForm({
    formId: 'admin-account-setup',
    initialValues: { email: '', code: '', password: '', confirmPassword: '' },
    schema: ACCOUNT_SETUP_FORM_SCHEMA,
    submit: ({ email, code, password }) => completeAdminAccountSetup({ email, code, password }),
    destination: (outcome) =>
      outcome.profile ? ROLE_HOME_PATHS[outcome.profile.role] : `${ROUTES.adminSignIn}?reason=${SIGN_IN_REASONS.passwordSet}`,
    successMessage: (outcome) => (outcome.isSignedIn ? 'Your password is set. Welcome to the school portal.' : null),
  });

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      <AuthFormError error={formError} />

      <FormField id={fieldId('email')} label='Email address' error={fieldErrors.email}>
        <Input
          {...fieldControlProps(fieldId('email'), fieldErrors.email)}
          type='email'
          inputMode='email'
          autoComplete='username'
          autoCapitalize='none'
          spellCheck={false}
          placeholder='name@example.com'
          value={values.email}
          onChange={updateField('email')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        id={fieldId('code')}
        label='Setup code'
        description='12 letters and numbers from the administrator who added you. Dashes and spaces are optional.'
        error={fieldErrors.code}
      >
        <Input
          {...fieldControlProps(fieldId('code'), fieldErrors.code, true)}
          autoComplete='one-time-code'
          autoCapitalize='characters'
          spellCheck={false}
          placeholder='XXXX-XXXX-XXXX'
          className='tabular-nums tracking-[0.12em] uppercase placeholder:tracking-[0.12em]'
          value={values.code}
          onChange={updateField('code')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        id={fieldId('password')}
        label='New password'
        description={`At least ${MIN_PASSWORD_LENGTH} characters. A short sentence is easy to remember and hard to guess.`}
        error={fieldErrors.password}
      >
        <PasswordInput
          {...fieldControlProps(fieldId('password'), fieldErrors.password, true)}
          autoComplete='new-password'
          value={values.password}
          onChange={updateField('password')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField id={fieldId('confirmPassword')} label='Confirm new password' error={fieldErrors.confirmPassword}>
        <PasswordInput
          {...fieldControlProps(fieldId('confirmPassword'), fieldErrors.confirmPassword)}
          autoComplete='new-password'
          value={values.confirmPassword}
          onChange={updateField('confirmPassword')}
          disabled={isSubmitting}
        />
      </FormField>

      <AuthSubmitButton isSubmitting={isSubmitting} label='Set password and sign in' pendingLabel='Setting up…' />
    </form>
  );
}
