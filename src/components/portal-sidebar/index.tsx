'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PORTALS } from '@/constants/portal-shell';
import { SCHOOL } from '@/constants/school';
import { cn } from '@/helpers/cn';
import { findActiveNavigationItem } from '@/helpers/portal-shell';
import { initialsOf } from '@/helpers/format';
import { portalShellStore } from '@/zustand/portal-shell';
import type { SessionProfile } from '@/types/auth';
import type { PortalRole } from '@/types/portal-shell';

interface PortalSidebarProps {
  /** WHICH PORTAL'S NAVIGATION TO SHOW (A NAME, NOT THE CONFIG: ITS ICONS CANNOT CROSS FROM THE SERVER). */
  role: PortalRole;
  profile: SessionProfile;
}

interface SidebarContentProps extends PortalSidebarProps {
  /** ICON RAIL: LABELS FADE OUT AND SHOW AS TOOLTIPS INSTEAD. ONLY THE DESKTOP SIDEBAR COLLAPSES. */
  isCollapsed: boolean;
}

/** FADES A LABEL OUT WHEN THE SIDEBAR COLLAPSES. NOWRAP SO NOTHING REFLOWS WHILE THE WIDTH ANIMATES. */
const COLLAPSIBLE_LABEL = 'whitespace-nowrap transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-0';

/**
 * NAVIGATION, BRANDING AND THE SIGNED-IN PERSON. SHARED BY THE DESKTOP SIDEBAR AND THE MOBILE DRAWER.
 * EVERY ICON SITS 30PX FROM THE LEFT EDGE, THE CENTRE OF THE 60PX RAIL, SO NOTHING MOVES WHEN IT COLLAPSES.
 */
function SidebarContent({ role, profile, isCollapsed }: SidebarContentProps) {
  const setIsNavigationOpen = portalShellStore((state) => state.setIsNavigationOpen);

  const pathname = usePathname();

  const portal = PORTALS[role];
  const activeItem = findActiveNavigationItem(pathname, portal);

  function closeDrawer() {
    setIsNavigationOpen(false);
  }

  return (
    <div data-collapsed={isCollapsed} className='group/sidebar flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground'>
      <div className='flex h-16 shrink-0 items-center border-b border-sidebar-border pr-14 pl-5'>
        <span className={cn('truncate text-base leading-5 font-semibold tracking-tight text-white', COLLAPSIBLE_LABEL)}>{SCHOOL.name}</span>
      </div>

      <nav aria-label={portal.navigationLabel} className='scrollbar-hidden flex-1 overflow-x-hidden overflow-y-auto px-3 py-4'>
        {portal.sections.map((section) => (
          <div key={section.label} className='mb-5 last:mb-0'>
            <p className={cn('px-2 pb-1.5 font-mono text-2xs text-sidebar-foreground/60 uppercase', COLLAPSIBLE_LABEL)}>{section.label}</p>
            <ul className='flex flex-col gap-px'>
              {section.items.map((item) => {
                const isActive = item === activeItem;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          onClick={closeDrawer}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex h-9 items-center gap-2.5 px-2.5 text-sm transition-colors outline-none',
                            'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset',
                            isActive ? 'bg-sidebar-active font-medium text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60 hover:text-white',
                          )}
                        >
                          <Icon aria-hidden className={cn('size-4 shrink-0', isActive ? 'text-white' : 'text-sidebar-foreground/80')} />
                          <span className={COLLAPSIBLE_LABEL}>{item.label}</span>
                        </Link>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side='right'>{item.label}</TooltipContent>}
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className='shrink-0 border-t border-sidebar-border p-3'>
        <div className='flex items-center gap-3 py-2'>
          <span aria-hidden className='flex size-9 shrink-0 items-center justify-center bg-sidebar-accent text-sm font-semibold text-white'>
            {initialsOf(profile.fullName)}
          </span>
          <div className={cn('min-w-0', COLLAPSIBLE_LABEL)}>
            <p className='truncate text-sm font-medium text-white'>{profile.fullName}</p>
            <p className='truncate font-mono text-2xs text-sidebar-foreground/70'>{profile.email}</p>
          </div>
        </div>
        <SignOutButton role={role} variant='sidebar' className='mt-1 w-full' />
      </div>
    </div>
  );
}

/**
 * PERSISTENT SIDEBAR FROM THE lg BREAKPOINT UP, COLLAPSIBLE TO A 60PX ICON RAIL. THE TOGGLE IS PINNED
 * 14PX FROM THE RIGHT EDGE: CENTRED IN THE RAIL, TOP RIGHT WHEN OPEN, AND IT RIDES THE EDGE SMOOTHLY.
 */
export function PortalSidebar({ role, profile }: PortalSidebarProps) {
  const isSidebarCollapsed = portalShellStore((state) => state.isSidebarCollapsed);
  const setIsSidebarCollapsed = portalShellStore((state) => state.setIsSidebarCollapsed);

  const toggleLabel = isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  function toggleSidebar() {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block print:hidden',
        isSidebarCollapsed ? 'w-15' : 'w-64',
      )}
    >
      <SidebarContent role={role} profile={profile} isCollapsed={isSidebarCollapsed} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type='button'
            onClick={toggleSidebar}
            aria-label={toggleLabel}
            aria-expanded={!isSidebarCollapsed}
            className='absolute top-4 right-3.5 flex size-8 items-center justify-center text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset'
          >
            {isSidebarCollapsed ? <PanelLeftOpenIcon aria-hidden className='size-4' /> : <PanelLeftCloseIcon aria-hidden className='size-4' />}
          </button>
        </TooltipTrigger>
        <TooltipContent side='right'>{toggleLabel}</TooltipContent>
      </Tooltip>
    </aside>
  );
}

/** THE SAME NAVIGATION IN A DRAWER BELOW lg, OPENED FROM THE HEADER. */
export function PortalNavigationDrawer({ role, profile }: PortalSidebarProps) {
  const isNavigationOpen = portalShellStore((state) => state.isNavigationOpen);
  const setIsNavigationOpen = portalShellStore((state) => state.setIsNavigationOpen);

  /** FOCUS THE CURRENT PAGE'S LINK (NOT THE FIRST BUTTON, WHICH WOULD BE "SIGN OUT") WHEN THE DRAWER OPENS. */
  function focusCurrentPage(event: Event) {
    event.preventDefault();
    const drawer = event.currentTarget as HTMLElement;
    const target = drawer.querySelector<HTMLElement>('a[aria-current="page"]') ?? drawer.querySelector<HTMLElement>('nav a');
    target?.focus();
  }

  return (
    <Sheet open={isNavigationOpen} onOpenChange={setIsNavigationOpen}>
      <SheetContent
        side='left'
        className='w-72 max-w-[85vw] gap-0 border-r-0 p-0 lg:hidden'
        showCloseButton={false}
        onOpenAutoFocus={focusCurrentPage}
      >
        <SheetTitle className='sr-only'>Navigation</SheetTitle>
        <SheetDescription className='sr-only'>{PORTALS[role].navigationLabel} portal sections</SheetDescription>
        <SidebarContent role={role} profile={profile} isCollapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
