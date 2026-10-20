'use client';

import { ChevronDownIcon, LogOutIcon, MenuIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { findActiveNavigationItem, findSectionLabel } from '@/helpers/admin-navigation';
import { formatLongToday, initialsOf } from '@/helpers/format';
import { useReferenceData } from '@/hooks/use-reference-data';
import { useSignOut } from '@/hooks/use-sign-out';
import { adminShellStore } from '@/zustand/admin-shell';
import type { SessionProfile } from '@/types/auth';

interface AdminHeaderProps {
  profile: SessionProfile;
}

/** TOP BAR: DRAWER BUTTON (SMALL SCREENS), WHERE YOU ARE, THE CURRENT ACADEMIC YEAR, TODAY, AND THE ACCOUNT MENU. */
export function AdminHeader({ profile }: AdminHeaderProps) {
  const isNavigationOpen = adminShellStore((state) => state.isNavigationOpen);
  const setIsNavigationOpen = adminShellStore((state) => state.setIsNavigationOpen);

  const pathname = usePathname();
  const { currentAcademicYear, isReady } = useReferenceData();
  const { signOutNow, isSigningOut } = useSignOut();

  const activeItem = findActiveNavigationItem(pathname);
  const sectionLabel = findSectionLabel(activeItem);

  function openNavigation() {
    setIsNavigationOpen(true);
  }

  return (
    <header className='sticky top-0 z-20 flex h-16 print:hidden items-center gap-3 border-b bg-card/95 px-4 lg:px-8'>
      <Button
        variant='ghost'
        size='icon'
        className='-ml-1 lg:hidden'
        aria-label='Open navigation'
        aria-expanded={isNavigationOpen}
        onClick={openNavigation}
      >
        <MenuIcon />
      </Button>

      <div className='min-w-0 flex-1'>
        {sectionLabel && <p className='font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase'>{sectionLabel}</p>}
        <p className='truncate text-base font-medium text-foreground'>{activeItem?.label ?? 'Admin'}</p>
      </div>

      <div className='hidden items-center gap-5 md:flex'>
        <div className='text-right'>
          <p className='font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase'>Academic year</p>
          <p className='text-sm font-medium text-foreground'>{isReady ? (currentAcademicYear?.name ?? 'Not set') : '…'}</p>
        </div>
        <div className='h-8 w-px bg-border' aria-hidden />
        <p className='text-sm text-muted-foreground' suppressHydrationWarning>
          {formatLongToday()}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-10 gap-2 px-1.5 md:ml-2' aria-label={`Account menu for ${profile.fullName}`}>
            <span aria-hidden className='flex size-8 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground'>
              {initialsOf(profile.fullName)}
            </span>
            <span className='hidden max-w-40 truncate text-sm font-medium xl:inline'>{profile.fullName}</span>
            <ChevronDownIcon aria-hidden className='hidden size-4 text-muted-foreground xl:inline' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-64'>
          <DropdownMenuLabel className='font-normal'>
            <p className='truncate text-sm font-medium text-foreground'>{profile.fullName}</p>
            <p className='truncate font-mono text-xs text-muted-foreground'>{profile.email}</p>
            <p className='mt-1.5 inline-flex bg-secondary px-1.5 py-0.5 font-mono text-2xs tracking-[0.12em] text-secondary-foreground uppercase'>
              Administrator
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOutNow} disabled={isSigningOut}>
            <LogOutIcon aria-hidden />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
