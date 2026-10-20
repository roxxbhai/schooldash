'use client';

import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/hooks/use-sign-out';
import { cn } from '@/helpers/cn';

interface SignOutButtonProps {
  variant?: 'outline' | 'ghost' | 'sidebar';
  className?: string;
}

export function SignOutButton({ variant = 'outline', className }: SignOutButtonProps) {
  const { signOutNow, isSigningOut } = useSignOut();
  const isSidebar = variant === 'sidebar';

  return (
    <Button
      type='button'
      variant={isSidebar ? 'ghost' : variant}
      onClick={signOutNow}
      disabled={isSigningOut}
      className={cn(isSidebar && 'justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white', className)}
    >
      {isSigningOut ? <Loader2Icon className='animate-spin' aria-hidden /> : <LogOutIcon aria-hidden />}
      {isSigningOut ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
