import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from 'lucide-react';
import { cn } from '@/helpers/cn';

interface FormAlertProps {
  tone: 'error' | 'info' | 'success';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const TONE_STYLES = {
  error: { icon: CircleAlertIcon, box: 'border-destructive/25 bg-destructive-soft text-destructive', role: 'alert' },
  info: { icon: InfoIcon, box: 'border-info/20 bg-info-soft text-info', role: 'status' },
  success: { icon: CircleCheckIcon, box: 'border-success/25 bg-success-soft text-success', role: 'status' },
} as const;

/** A PERSISTENT MESSAGE INSIDE A FORM OR PAGE, ANNOUNCED TO SCREEN READERS. ERRORS INTERRUPT; OTHERS ARE POLITE. */
export function FormAlert({ tone, title, children, className }: FormAlertProps) {
  const style = TONE_STYLES[tone];
  const Icon = style.icon;

  return (
    <div role={style.role} className={cn('flex gap-2.5 border px-3 py-2.5 text-sm', style.box, className)}>
      <Icon aria-hidden className='mt-0.5 size-4 shrink-0' />
      <div className='min-w-0 text-foreground'>
        {title && <p className='font-medium'>{title}</p>}
        <div className={cn(title && 'mt-0.5 text-muted-foreground')}>{children}</div>
      </div>
    </div>
  );
}
