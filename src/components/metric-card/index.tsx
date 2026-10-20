import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/helpers/cn';

type MetricTone = 'brand' | 'success' | 'warning' | 'info';

const ICON_TONES: Record<MetricTone, string> = {
  brand: 'bg-secondary text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
};

interface MetricCardProps {
  label: string;
  value: string | null;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: MetricTone;
  href?: string;
  isLoading?: boolean;
}

/** ONE REAL FIGURE FROM THE API WITH ITS LABEL. `value` IS NULL WHEN IT COULD NOT BE LOADED; IT IS NEVER GUESSED. */
export function MetricCard({ label, value, detail, icon: Icon, tone = 'brand', href, isLoading = false }: MetricCardProps) {
  const content = (
    <>
      <div className='flex items-start justify-between gap-3'>
        <p className='text-sm font-medium text-muted-foreground'>{label}</p>
        <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center', ICON_TONES[tone])}>
          <Icon className='size-4' />
        </span>
      </div>
      {isLoading ? (
        <Skeleton className='mt-3 h-8 w-20' />
      ) : (
        <p className='mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums'>{value ?? '—'}</p>
      )}
      {detail && <div className='mt-1 text-sm text-muted-foreground'>{detail}</div>}
    </>
  );

  const cardClass = 'block border bg-card p-5 shadow-xs';

  if (!href) return <div className={cardClass}>{content}</div>;

  return (
    <Link href={href} className={cn(cardClass, 'transition-[box-shadow,border-color] hover:border-border-strong hover:shadow-sm')}>
      {content}
    </Link>
  );
}
