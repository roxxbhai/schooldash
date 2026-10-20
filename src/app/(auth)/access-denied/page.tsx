import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccessDeniedContent } from '@/components/access-denied-content';
import { AuthFormFrame } from '@/components/auth-form-frame';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Portal not available yet' };

export default function AccessDeniedPage() {
  return (
    <AuthFormFrame eyebrow='Signed in' title='Your portal is on its way' description='This part of the school portal is for administrators.'>
      <Suspense fallback={<Skeleton className='h-24 w-full' />}>
        <AccessDeniedContent />
      </Suspense>
    </AuthFormFrame>
  );
}
