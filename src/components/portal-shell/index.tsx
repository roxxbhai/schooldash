'use client';

import { PortalHeader } from '@/components/portal-header';
import { PortalNavigationDrawer, PortalSidebar } from '@/components/portal-sidebar';
import { cn } from '@/helpers/cn';
import type { SessionProfile } from '@/types/auth';
import type { PortalRole } from '@/types/portal-shell';
import { portalShellStore } from '@/zustand/portal-shell';

interface PortalShellProps {
  role: PortalRole;
  profile: SessionProfile;
  children: React.ReactNode;
}

/** THE SIGNED-IN CHROME OF THE ADMIN AND TEACHER PORTALS. RENDERED ONLY AFTER THE PORTAL'S GATE HAS CONFIRMED THE ROLE. */
export function PortalShell({ role, profile, children }: PortalShellProps) {
  const isSidebarCollapsed = portalShellStore((state) => state.isSidebarCollapsed);

  return (
    <div data-portal={role} className='min-h-dvh bg-background print:bg-white'>
      <a
        href='#main-content'
        className='sr-only z-50 bg-primary print:hidden px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        Skip to content
      </a>
      <PortalSidebar role={role} profile={profile} />
      <PortalNavigationDrawer role={role} profile={profile} />
      <div className={cn('transition-[padding] duration-220 ease-in-out print:pl-0', isSidebarCollapsed ? 'lg:pl-15' : 'lg:pl-64')}>
        <PortalHeader role={role} />
        <main id='main-content' tabIndex={-1} className='mx-auto w-full max-w-[1440px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0'>
          {children}
        </main>
      </div>
    </div>
  );
}
