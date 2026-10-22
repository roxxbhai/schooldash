import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AccountSetupForm } from '@/components/account-setup-form';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Set up your administrator account' };

export default function AdminAccountSetupPage() {
  return (
    <AuthFormFrame
      back={{ href: ROUTES.adminSignIn, label: 'Administrator sign-in' }}
      title='Set up your account'
      description='Enter your email address, the setup code the administrator who added you was shown, and choose a password.'
      footer={
        <p>
          Already set up?{' '}
          <Link href={ROUTES.adminSignIn} className='font-medium text-primary underline-offset-3 hover:underline'>
            Sign in
          </Link>
          . Lost your code, or it has expired? Ask another administrator for a new one.
        </p>
      }
    >
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <AccountSetupForm />
    </AuthFormFrame>
  );
}
