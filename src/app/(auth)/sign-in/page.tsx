import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { SignInForm } from '@/components/sign-in-form';
import { SignInNotice } from '@/components/sign-in-notice';
import { SignedInRedirect } from '@/components/signed-in-redirect';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <AuthFormFrame
      eyebrow='Welcome back'
      title='Sign in'
      description='Use the email address registered with the school office.'
      footer={
        <p>
          First time here?{' '}
          <Link href={ROUTES.accountSetup} className='font-medium text-primary underline-offset-3 hover:underline'>
            Set up your account
          </Link>{' '}
          with the setup code from the school office. Accounts are created by the school; there is no public sign-up.
        </p>
      }
    >
      <Suspense>
        <SignedInRedirect />
      </Suspense>
      <Suspense>
        <SignInNotice />
      </Suspense>
      <SignInForm />
    </AuthFormFrame>
  );
}
