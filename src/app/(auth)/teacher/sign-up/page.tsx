import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { TeacherSignUpForm } from '@/components/teacher-sign-up-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Teacher sign-up' };

export default function TeacherSignUpPage() {
  return (
    <AuthFormFrame
      back={{ href: ROUTES.teacherSignIn, label: 'Teacher sign-in' }}
      title='Teacher sign-up'
      description='The school office adds you first. Then enter the mobile number they registered and choose your password.'
    >
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <TeacherSignUpForm />
    </AuthFormFrame>
  );
}
