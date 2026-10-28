import type { LucideIcon } from 'lucide-react';
import { InboxIcon } from 'lucide-react';
import { cn } from '@/helpers/cn';

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

/** WHAT TO SHOW WHEN A LIST HAS NOTHING IN IT, AND WHAT TO DO NEXT. */
export function EmptyState({ title, description, icon: Icon = InboxIcon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span aria-hidden className='flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted-foreground shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]'>
        <Icon className='size-5' />
      </span>
      <p className='mt-4 text-base font-medium text-foreground'>{title}</p>
      {description && <div className='mt-1 max-w-sm text-sm text-muted-foreground'>{description}</div>}
      {action && <div className='mt-5'>{action}</div>}
    </div>
  );
}
