'use client';

import { RefreshCwIcon, ServerCrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { SchoolWordmark } from '@/components/school-wordmark';

interface PortalUnavailableProps {
  message: string;
}

/** SHOWN INSTEAD OF THE PORTAL WHEN THE SESSION COULDN'T BE CHECKED (SUPABASE UNREACHABLE). NEVER SHOWS STALE OR PARTIAL DATA. */
export function PortalUnavailable({ message }: PortalUnavailableProps) {
  const [isRetrying, startRetry] = useTransition();

  const router = useRouter();

  function retry() {
    startRetry(() => router.refresh());
  }

  return (
    <main className='flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16'>
      <div className='w-full max-w-md rounded-xl bg-card shadow-sm p-8'>
        <SchoolWordmark size='sm' />
        <ServerCrashIcon aria-hidden className='mt-8 size-6 text-muted-foreground' />
        <h1 className='mt-3 text-2xl font-semibold tracking-tight'>The portal is unavailable</h1>
        <p role='alert' className='mt-2 text-base text-muted-foreground'>
          {message}
        </p>
        <Button className='mt-6' onClick={retry} disabled={isRetrying}>
          <RefreshCwIcon aria-hidden className={isRetrying ? 'animate-spin' : undefined} />
          {isRetrying ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    </main>
  );
}
