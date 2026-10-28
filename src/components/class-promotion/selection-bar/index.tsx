'use client';

import { ArrowUpRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pluralize } from '@/helpers/format';
import type { ClassPromotion } from '@/hooks/use-class-promotion';

/** SHOWN WHILE STUDENTS ARE SELECTED: HOW MANY, PROMOTE THEM, OR CLEAR. TICK, THEN ONE CLICK. */
export function PromotionSelectionBar({ promotion }: { promotion: ClassPromotion }) {
  const count = promotion.selectedIds.length;
  if (count === 0) return null;

  return (
    <div
      role='region'
      aria-label='Selected students'
      className='mb-3 flex flex-wrap items-center gap-3 border border-primary/30 bg-secondary px-4 py-2.5 transition-opacity duration-150 ease-out starting:opacity-0'
    >
      <p className='text-sm font-medium text-secondary-foreground' aria-live='polite'>
        {pluralize(count, 'student')} selected
      </p>
      <div className='ml-auto flex items-center gap-2'>
        <Button type='button' variant='ghost' size='sm' onClick={promotion.clearSelection}>
          <XIcon aria-hidden />
          Clear
        </Button>
        <Button type='button' size='sm' onClick={promotion.openForSelection}>
          <ArrowUpRightIcon aria-hidden />
          Promote {pluralize(count, 'student')}
        </Button>
      </div>
    </div>
  );
}
