'use client';

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** APP-WIDE TOASTS. LIGHT ONLY; STATUS COLOURS COME FROM THE DESIGN TOKENS IN globals.css. */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme='light'
      className='toaster group'
      icons={{
        success: <CircleCheckIcon className='size-4 text-success' />,
        info: <InfoIcon className='size-4 text-info' />,
        warning: <TriangleAlertIcon className='size-4 text-warning' />,
        error: <OctagonXIcon className='size-4 text-destructive' />,
        loading: <Loader2Icon className='size-4 animate-spin' />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': '0px',
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: 'cn-toast shadow-md', description: 'text-muted-foreground' } }}
      {...props}
    />
  );
}

export { Toaster };
