import { cn } from '@/helpers/cn';

interface PanelProps {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** A WHITE SECTION WITH AN OPTIONAL TITLE ROW; THE PORTAL'S CARD. */
export function Panel({ title, description, actions, className, bodyClassName, children }: PanelProps) {
  return (
    <section className={cn('border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <div className='flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4'>
          <div className='min-w-0'>
            {title && <h2 className='text-xl font-semibold tracking-tight text-foreground'>{title}</h2>}
            {description && <div className='mt-0.5 text-sm text-muted-foreground'>{description}</div>}
          </div>
          {actions && <div className='flex shrink-0 items-center gap-2'>{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}
