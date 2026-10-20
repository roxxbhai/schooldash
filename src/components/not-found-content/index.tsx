import Link from 'next/link';
import { SchoolWordmark } from '@/components/school-wordmark';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

/** THE APP-WIDE 404. IT REVEALS NOTHING ABOUT WHETHER A RECORD EXISTS. */
export function NotFoundContent() {
  return (
    <main className='flex min-h-dvh items-center justify-center bg-background px-6 py-16'>
      <div className='w-full max-w-md border bg-card p-8 shadow-sm'>
        <SchoolWordmark size='sm' />
        <p className='mt-8 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase'>Error 404</p>
        <h1 className='mt-2 text-2xl font-semibold tracking-tight'>Page not found</h1>
        <p className='mt-2 text-base text-muted-foreground'>The address may be mistyped, or the page has moved.</p>
        <Button asChild className='mt-6'>
          <Link href={ROUTES.home}>Go to the portal</Link>
        </Button>
      </div>
    </main>
  );
}
