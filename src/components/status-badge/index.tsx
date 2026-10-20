import { cn } from '@/helpers/cn';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-secondary text-secondary-foreground',
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/** A SQUARE, TINTED LABEL FOR A STATE (ACTIVE, DRAFT, PRESENT …). COLOUR IS NEVER THE ONLY SIGNAL: THE TEXT SAYS IT TOO. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 px-1.5 text-xs font-medium whitespace-nowrap', TONE_CLASSES[tone], className)}>
      <span aria-hidden className='size-1.5 bg-current' />
      {children}
    </span>
  );
}
