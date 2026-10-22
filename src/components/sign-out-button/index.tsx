'use client';

import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSignOut } from '@/hooks/use-sign-out';
import { cn } from '@/helpers/cn';
import type { AppRole } from '@/types/auth';

interface SignOutButtonProps {
  /** WHOSE SIGN-IN PAGE TO RETURN TO. */
  role: AppRole;
  variant?: 'outline' | 'ghost' | 'sidebar';
  /** SHOWN ON HOVER, E.G. WHEN THE SIDEBAR IS COLLAPSED AND THE LABEL IS HIDDEN. */
  tooltip?: string;
  className?: string;
}

/** SIGNING OUT IS CONFIRMED FIRST, SO A STRAY CLICK NEVER ENDS THE SESSION. */
export function SignOutButton({ role, variant = 'outline', tooltip, className }: SignOutButtonProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { signOutNow, isSigningOut } = useSignOut(role);

  const isSidebar = variant === 'sidebar';

  const button = (
    <Button
      type='button'
      variant={isSidebar ? 'ghost' : variant}
      onClick={() => setIsConfirmOpen(true)}
      disabled={isSigningOut}
      className={cn(
        isSidebar &&
          'justify-start overflow-hidden px-[9px] text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white focus-visible:ring-sidebar-ring focus-visible:ring-offset-0 focus-visible:ring-inset',
        className,
      )}
    >
      {isSigningOut ? <Loader2Icon className='animate-spin' aria-hidden /> : <LogOutIcon aria-hidden />}
      {/* IN THE SIDEBAR THE LABEL FADES OUT WHEN THE SIDEBAR COLLAPSES TO ITS ICON RAIL. */}
      <span className={cn(isSidebar && 'whitespace-nowrap transition-opacity duration-120 ease-out group-data-[collapsed=true]/sidebar:opacity-0')}>
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </span>
    </Button>
  );

  return (
    <>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side='right'>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title='Sign out?'
        description='You will need to sign in again to use the portal.'
        confirmLabel='Sign out'
        tone='destructive'
        isPending={isSigningOut}
        onConfirm={() => void signOutNow()}
      />
    </>
  );
}
