'use client';

import Link from 'next/link';
import { AuthFormError } from '@/components/auth-form-error';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD_LENGTH, TEACHER_SIGN_UP_FORM_SCHEMA } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS, ROUTES, SIGN_IN_REASONS } from '@/constants/routes';
import { signUpTeacher } from '@/functions/auth';
import { fieldControlProps } from '@/helpers/forms';
import { useAuthForm } from '@/hooks/use-auth-form';

/** A TEACHER'S ONE-TIME SIGN-UP: THE PHONE NUMBER THE SCHOOL REGISTERED + A NEW PASSWORD, THEN SIGNED IN. */
export function TeacherSignUpForm() {
  const { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit } = useAuthForm({
    formId: 'teacher-sign-up',
    initialValues: { phone: '', password: '', confirmPassword: '' },
    schema: TEACHER_SIGN_UP_FORM_SCHEMA,
    submit: ({ phone, password }) => signUpTeacher({ phone, password }),
    destination: (outcome) =>
      outcome.profile ? ROLE_HOME_PATHS[outcome.profile.role] : `${ROUTES.teacherSignIn}?reason=${SIGN_IN_REASONS.passwordSet}`,
    successMessage: (outcome) => (outcome.isSignedIn ? 'Your password is set. Welcome to the school portal.' : null),
  });

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      <AuthFormError error={formError} nextStep={{ code: 'CONFLICT', prompt: 'Go to', label: 'teacher sign-in', href: ROUTES.teacherSignIn }} />

      <FormField id={fieldId('phone')} label='Mobile number' description='The number you gave the school office.' error={fieldErrors.phone}>
        <Input
          {...fieldControlProps(fieldId('phone'), fieldErrors.phone, true)}
          type='tel'
          inputMode='tel'
          autoComplete='tel-national'
          placeholder='98765 43210'
          className='tabular-nums'
          value={values.phone}
          onChange={updateField('phone')}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        id={fieldId('password')}
        label='Choose a password'
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

      <FormField id={fieldId('confirmPassword')} label='Confirm password' error={fieldErrors.confirmPassword}>
        <PasswordInput
          {...fieldControlProps(fieldId('confirmPassword'), fieldErrors.confirmPassword)}
          autoComplete='new-password'
          value={values.confirmPassword}
          onChange={updateField('confirmPassword')}
          disabled={isSubmitting}
        />
      </FormField>

      <AuthSubmitButton isSubmitting={isSubmitting} label='Sign up' pendingLabel='Signing up…' />

      <p className='text-center text-sm text-muted-foreground'>
        Already signed up?{' '}
        <Link href={ROUTES.teacherSignIn} className='font-medium text-primary underline-offset-3 hover:underline'>
          Sign in
        </Link>
      </p>
    </form>
  );
}
