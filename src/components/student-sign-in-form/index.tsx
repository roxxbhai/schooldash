'use client';

import { AuthFormError } from '@/components/auth-form-error';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { STUDENT_SIGN_IN_FORM_SCHEMA } from '@/constants/auth-forms';
import { ROLE_HOME_PATHS } from '@/constants/routes';
import { signInStudent } from '@/functions/auth';
import { fieldControlProps } from '@/helpers/forms';
import { useAuthForm } from '@/hooks/use-auth-form';

/** STUDENT SIGN-IN: ADMISSION NUMBER ONLY, AGAINST POST /api/auth/student/login. */
export function StudentSignInForm() {
  const { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit } = useAuthForm({
    formId: 'student-sign-in',
    initialValues: { admissionNumber: '' },
    schema: STUDENT_SIGN_IN_FORM_SCHEMA,
    submit: signInStudent,
    destination: (profile) => ROLE_HOME_PATHS[profile.role],
  });

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className='flex flex-col gap-5' aria-busy={isSubmitting}>
      <AuthFormError error={formError} />

      <FormField id={fieldId('admissionNumber')} label='Admission number' description='As printed on your school ID card.' error={fieldErrors.admissionNumber}>
        <Input
          {...fieldControlProps(fieldId('admissionNumber'), fieldErrors.admissionNumber, true)}
          autoComplete='username'
          autoCapitalize='characters'
          spellCheck={false}
          className='tabular-nums'
          value={values.admissionNumber}
          onChange={updateField('admissionNumber')}
          disabled={isSubmitting}
        />
      </FormField>

      <AuthSubmitButton isSubmitting={isSubmitting} label='Sign in' pendingLabel='Signing in…' />
    </form>
  );
}
