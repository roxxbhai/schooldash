import * as React from 'react';
import { cn } from '@/helpers/cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content min-h-16 w-full px-3 py-2 text-sm md:text-sm rounded-lg border border-input bg-card transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-placeholder hover:border-border-hover focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--destructive)]',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
