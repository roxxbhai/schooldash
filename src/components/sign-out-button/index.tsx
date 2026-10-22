'use client';

import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/hooks/use-sign-out';
import { cn } from '@/helpers/cn';
import type { AppRole } from '@/types/auth';

interface SignOutButtonProps {
  /** WHOSE SIGN-IN PAGE TO RETURN TO. */
  role: AppRole;
  variant?: 'outline' | 'ghost' | 'sidebar';
  className?: string;
}

export function SignOutButton({ role, variant = 'outline', className }: SignOutButtonProps) {
  const { signOutNow, isSigningOut } = useSignOut(role);
  const isSidebar = variant === 'sidebar';

  return (
    <Button
      type='button'
      variant={isSidebar ? 'ghost' : variant}
      onClick={signOutNow}
      disabled={isSigningOut}
      className={cn(isSidebar && 'justify-start overflow-hidden px-[9px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-white', className)}
    >
      {isSigningOut ? <Loader2Icon className='animate-spin' aria-hidden /> : <LogOutIcon aria-hidden />}
      {/* IN THE SIDEBAR THE LABEL FADES OUT WHEN THE SIDEBAR COLLAPSES TO ITS ICON RAIL. */}
      <span className={cn(isSidebar && 'whitespace-nowrap transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-0')}>
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </span>
    </Button>
  );
}
