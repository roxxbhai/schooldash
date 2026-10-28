'use client';

import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RouteErrorProps {
  /** RE-RENDERS THE SEGMENT (NEXT.JS ERROR BOUNDARY). */
  retry: () => void;
  digest?: string;
}

/**
 * SHOWN WHEN A PAGE CRASHES WHILE RENDERING. THE PORTAL CHROME STAYS IN PLACE.
 * THE ERROR'S MESSAGE IS NEVER SHOWN; ONLY ITS DIGEST, WHICH MATCHES THE SERVER LOG.
 */
export function RouteError({ retry, digest }: RouteErrorProps) {
  return (
    <div role='alert' className='mx-auto max-w-lg rounded-xl bg-card shadow-xs p-8'>
      <TriangleAlertIcon aria-hidden className='size-6 text-warning' />
      <h1 className='mt-3 text-2xl font-semibold tracking-tight'>This page ran into a problem</h1>
      <p className='mt-2 text-base text-muted-foreground'>
        Nothing was changed. Try again, and if it keeps happening, note the time and the reference below for whoever looks after the portal.
      </p>
      {digest && <p className='mt-3 tabular-nums text-xs text-muted-foreground'>Reference: {digest}</p>}
      <Button className='mt-6' onClick={retry}>
        <RefreshCwIcon aria-hidden />
        Try again
      </Button>
    </div>
  );
}
