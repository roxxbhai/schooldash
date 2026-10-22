import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSignInForm } from '@/components/admin-sign-in-form';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignInNotice } from '@/components/sign-in-notice';
import { SignedInRedirect } from '@/components/signed-in-redirect';

export const metadata: Metadata = { title: 'Administrator sign-in' };

export default function AdminSignInPage() {
  return (
    <AuthFormFrame
      title='Administrator sign-in'
      description='Use the email address registered with the school office.'
    >
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <Suspense>
        <SignInNotice />
      </Suspense>
      <AdminSignInForm />
    </AuthFormFrame>
  );
}
