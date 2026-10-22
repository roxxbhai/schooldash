'use client';

import * as React from 'react';
import { cn } from '@/helpers/cn';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot='dialog' {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot='dialog-close' {...props} />;
}

/** ENTER 180MS, EXIT 120MS, STRONG EASE-OUT. ADDED ONLY WHEN ANIMATED (tailwind-merge CAN'T OVERRIDE tw-animate CLASSES). */
const OVERLAY_ANIMATION = 'ease-out data-open:duration-180 data-closed:duration-120 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0';
const CONTENT_ANIMATION = `${OVERLAY_ANIMATION} data-open:zoom-in-95 data-closed:zoom-out-95`;

function DialogOverlay({
  className,
  isAnimated = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  isAnimated?: boolean
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot='dialog-overlay'
      className={cn('fixed inset-0 isolate z-50 bg-sidebar/40', isAnimated && OVERLAY_ANIMATION, className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  isAnimated = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** FALSE FOR SURFACES OPENED BY KEYBOARD MANY TIMES A DAY (THE ⌘K PALETTE): THEY APPEAR AND GO INSTANTLY. */
  isAnimated?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay isAnimated={isAnimated} />
      <DialogPrimitive.Content
        data-slot='dialog-content'
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-none border bg-popover p-6 text-sm/relaxed text-popover-foreground shadow-lg outline-none sm:max-w-sm',
          isAnimated && CONTENT_ANIMATION,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot='dialog-close' asChild>
            <Button
              variant='ghost'
              className='absolute top-2 right-2'
              size='icon-sm'
            >
              <XIcon
              />
              <span className='sr-only'>Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-header'
      className={cn('flex flex-col gap-1 text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot='dialog-footer'
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant='outline'>Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot='dialog-title'
      className={cn('text-sm font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot='dialog-description'
      className={cn(
        'text-sm/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
