import { Skeleton } from '@/components/ui/skeleton';

/** THE PORTAL'S OUTLINE WHILE THE SESSION IS CHECKED. NO NAMES, NO DATA. */
export function AdminShellSkeleton() {
  return (
    <div className='min-h-dvh bg-background' aria-busy='true' aria-label='Loading the portal'>
      <div className='fixed inset-y-0 left-0 hidden w-64 bg-sidebar lg:block' />
      <div className='lg:pl-64'>
        <div className='h-16 border-b bg-card' />
        <div className='mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8'>
          <Skeleton className='h-7 w-56' />
          <Skeleton className='mt-3 h-4 w-80 max-w-full' />
          <div className='mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className='h-28' />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
