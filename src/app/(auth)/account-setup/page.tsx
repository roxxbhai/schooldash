import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AccountSetupForm } from '@/components/account-setup-form';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Set up your account' };

export default function AccountSetupPage() {
  return (
    <AuthFormFrame
      eyebrow='First-time setup'
      title='Set up your account'
      description='Enter the email address the school registered for you, the setup code you were given, and choose a password.'
      footer={
        <p>
          Already set up?{' '}
          <Link href={ROUTES.signIn} className='font-medium text-primary underline-offset-3 hover:underline'>
            Sign in
          </Link>
          . Lost your code, or it has expired? Ask the school office for a new one.
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
