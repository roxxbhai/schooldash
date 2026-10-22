'use client';

import { AuthFormError } from '@/components/auth-form-error';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { ADMIN_SIGN_IN_FORM_SCHEMA } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES } from '@/constants/routes';
import { signInAdmin } from '@/functions/auth';
import { fieldControlProps } from '@/helpers/forms';
import { useAuthForm } from '@/hooks/use-auth-form';

/** ADMINISTRATOR SIGN-IN: EMAIL + PASSWORD AGAINST POST /api/auth/admin/login. */
export function AdminSignInForm() {
  const { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit } = useAuthForm({
    formId: 'admin-sign-in',
    initialValues: { email: '', password: '' },
    schema: ADMIN_SIGN_IN_FORM_SCHEMA,
    submit: signInAdmin,
    destination: (profile) => ROLE_HOME_PATHS[profile.role],
  });

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      <AuthFormError
        error={formError}
        nextStep={{ code: 'INVALID_CREDENTIALS', prompt: 'Newly added administrator?', label: 'Set up your account', href: ROUTES.adminAccountSetup }}
      />

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

      <FormField id={fieldId('password')} label='Password' error={fieldErrors.password}>
        <PasswordInput
          {...fieldControlProps(fieldId('password'), fieldErrors.password)}
          autoComplete='current-password'
          value={values.password}
          onChange={updateField('password')}
          disabled={isSubmitting}
        />
      </FormField>

      <AuthSubmitButton isSubmitting={isSubmitting} label='Sign in' pendingLabel='Signing in…' />
    </form>
  );
}
