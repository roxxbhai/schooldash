import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignInNotice } from '@/components/sign-in-notice';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { StudentSignInForm } from '@/components/student-sign-in-form';

export const metadata: Metadata = { title: 'Student sign-in' };

export default function StudentSignInPage() {
  return (
    <AuthFormFrame title='Student sign-in' description='Enter your admission number.'>
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <Suspense>
        <SignInNotice />
      </Suspense>
      <StudentSignInForm />
    </AuthFormFrame>
  );
}
