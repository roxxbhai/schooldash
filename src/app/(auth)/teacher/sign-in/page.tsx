import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignInNotice } from '@/components/sign-in-notice';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { TeacherSignInForm } from '@/components/teacher-sign-in-form';

export const metadata: Metadata = { title: 'Teacher sign-in' };

export default function TeacherSignInPage() {
  return (
    <AuthFormFrame
      title='Teacher sign-in'
      description='Use the mobile number registered with the school office.'
    >
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <Suspense>
        <SignInNotice />
      </Suspense>
      <TeacherSignInForm />
    </AuthFormFrame>
  );
}
