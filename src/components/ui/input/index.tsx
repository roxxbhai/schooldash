import * as React from 'react';
import { cn } from '@/helpers/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        // QUIET FIELD: ONLY THE BORDER CHANGES. DARKER ON HOVER; ON FOCUS IT TURNS NAVY AND THICKENS INWARD (NO GLOW, NO SHIFT).
        'h-9 w-full min-w-0 px-3 py-1 text-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground md:text-sm rounded-lg border border-input bg-card transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-placeholder hover:border-border-hover focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--destructive)]',
        className
      )}
      {...props}
    />
  );
}

export { Input };
