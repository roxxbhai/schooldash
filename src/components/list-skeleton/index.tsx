import { Skeleton } from '@/components/ui/skeleton';

/** PLACEHOLDER ROWS INSIDE A PANEL WHILE ITS LIST LOADS. */
export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className='flex flex-col gap-3 p-5' aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className='h-10 rounded-lg' />
      ))}
    </div>
  );
}
