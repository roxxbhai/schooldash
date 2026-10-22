'use client';

import Link from 'next/link';
import { AuthFormError } from '@/components/auth-form-error';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { TEACHER_SIGN_IN_FORM_SCHEMA } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES } from '@/constants/routes';
import { signInTeacher } from '@/functions/auth';
import { fieldControlProps } from '@/helpers/forms';
import { useAuthForm } from '@/hooks/use-auth-form';

/** TEACHER SIGN-IN: PHONE NUMBER + PASSWORD AGAINST POST /api/auth/teacher/login. */
export function TeacherSignInForm() {
  const { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit } = useAuthForm({
    formId: 'teacher-sign-in',
    initialValues: { phone: '', password: '' },
    schema: TEACHER_SIGN_IN_FORM_SCHEMA,
    submit: signInTeacher,
    destination: (profile) => ROLE_HOME_PATHS[profile.role],
  });

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      <AuthFormError
        error={formError}
        nextStep={{ code: 'INVALID_CREDENTIALS', prompt: 'First time here?', label: 'Sign up with your phone number', href: ROUTES.teacherSignUp }}
      />

      <FormField id={fieldId('phone')} label='Mobile number' error={fieldErrors.phone}>
        <Input
          {...fieldControlProps(fieldId('phone'), fieldErrors.phone)}
          type='tel'
          inputMode='tel'
          autoComplete='tel-national'
          placeholder='98765 43210'
          className='font-mono'
          value={values.phone}
          onChange={updateField('phone')}
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

      <p className='text-center text-sm text-muted-foreground'>
        New teacher?{' '}
        <Link href={ROUTES.teacherSignUp} className='font-medium text-primary underline-offset-3 hover:underline'>
          Sign up
        </Link>
      </p>
    </form>
  );
}
