'use client';

import { MenuIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { CommandPalette } from '@/components/command-palette';
import { Button } from '@/components/ui/button';
import { PORTALS } from '@/constants/portal-shell';
import { findActiveNavigationItem, findSectionLabel } from '@/helpers/portal-shell';
import { formatLongToday } from '@/helpers/format';
import { useReferenceData } from '@/hooks/use-reference-data';
import { portalShellStore } from '@/zustand/portal-shell';
import type { PortalRole } from '@/types/portal-shell';

interface PortalHeaderProps {
  role: PortalRole;
}

/**
 * TOP BAR: DRAWER BUTTON (SMALL SCREENS), WHERE YOU ARE, SEARCH (⌘K), THE CURRENT ACADEMIC YEAR AND TODAY.
 * A TRANSLUCENT LAYER: CONTENT SCROLLS UNDER IT, BLURRED. THE ACCOUNT AND SIGN-OUT LIVE IN THE SIDEBAR.
 */
export function PortalHeader({ role }: PortalHeaderProps) {
  const isNavigationOpen = portalShellStore((state) => state.isNavigationOpen);
  const setIsNavigationOpen = portalShellStore((state) => state.setIsNavigationOpen);

  const pathname = usePathname();
  const { currentAcademicYear, isReady } = useReferenceData();

  const portal = PORTALS[role];
  const activeItem = findActiveNavigationItem(pathname, portal);
  const sectionLabel = findSectionLabel(activeItem, portal);

  function openNavigation() {
    setIsNavigationOpen(true);
  }

  return (
    // FROM md UP, THREE COLUMNS WITH EQUAL OUTER TRACKS KEEP THE SEARCH FIELD IN THE TRUE CENTRE.
    <header className='sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/75 px-4 backdrop-blur-lg backdrop-saturate-150 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6 lg:px-8 print:hidden'>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        <Button
          variant='ghost'
          size='icon'
          className='-ml-1 shrink-0 lg:hidden'
          aria-label='Open navigation'
          aria-expanded={isNavigationOpen}
          onClick={openNavigation}
        >
          <MenuIcon />
        </Button>
        {sectionLabel && (
          <>
            <span className='shrink-0 text-xs font-medium text-muted-foreground uppercase'>{sectionLabel}</span>
            <span aria-hidden className='h-4 w-px shrink-0 bg-border' />
          </>
        )}
        <span className='truncate text-base font-medium text-foreground'>{activeItem?.label ?? portal.roleLabel}</span>
      </div>

      <CommandPalette role={role} />

      <div className='hidden items-center justify-end gap-5 lg:flex'>
        <p className='flex items-center gap-1.5 text-sm'>
          <span className='text-xs font-medium text-muted-foreground uppercase'>Academic year</span>
          <span aria-hidden className='text-muted-foreground'>-</span>
          <span className='font-medium text-foreground'>{isReady ? (currentAcademicYear?.name ?? 'Not set') : '…'}</span>
        </p>
        <span aria-hidden className='h-6 w-px bg-border' />
        <p className='text-sm text-muted-foreground' suppressHydrationWarning>
          {formatLongToday()}
        </p>
      </div>
    </header>
  );
}
