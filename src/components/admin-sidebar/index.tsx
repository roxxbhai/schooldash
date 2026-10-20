'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SchoolWordmark } from '@/components/school-wordmark';
import { SignOutButton } from '@/components/sign-out-button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ADMIN_NAVIGATION } from '@/constants/admin-navigation';
import { cn } from '@/helpers/cn';
import { findActiveNavigationItem } from '@/helpers/admin-navigation';
import { initialsOf } from '@/helpers/format';
import { adminShellStore } from '@/zustand/admin-shell';
import type { SessionProfile } from '@/types/auth';

interface AdminSidebarProps {
  profile: SessionProfile;
}

/** NAVIGATION, BRANDING AND THE SIGNED-IN ADMIN. SHARED BY THE DESKTOP SIDEBAR AND THE MOBILE DRAWER. */
function SidebarContent({ profile }: AdminSidebarProps) {
  const setIsNavigationOpen = adminShellStore((state) => state.setIsNavigationOpen);

  const pathname = usePathname();

  const activeItem = findActiveNavigationItem(pathname);

  function closeDrawer() {
    setIsNavigationOpen(false);
  }

  return (
    <div className='flex h-full flex-col bg-sidebar text-sidebar-foreground'>
      <div className='flex h-16 shrink-0 items-center border-b border-sidebar-border px-5'>
        <SchoolWordmark tone='inverse' size='sm' />
      </div>

      <nav aria-label='Admin' className='flex-1 overflow-y-auto px-3 py-4'>
        {ADMIN_NAVIGATION.map((section) => (
          <div key={section.label} className='mb-5 last:mb-0'>
            <p className='px-2 pb-1.5 font-mono text-2xs tracking-[0.14em] text-sidebar-foreground/60 uppercase'>{section.label}</p>
            <ul className='flex flex-col gap-px'>
              {section.items.map((item) => {
                const isActive = item === activeItem;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeDrawer}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex h-9 items-center gap-2.5 px-2.5 text-sm transition-colors outline-none',
                        'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset',
                        isActive
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-brand-gold'
                          : 'hover:bg-sidebar-accent/60 hover:text-white',
                      )}
                    >
                      <Icon aria-hidden className={cn('size-4 shrink-0', isActive ? 'text-white' : 'text-sidebar-foreground/80')} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className='shrink-0 border-t border-sidebar-border p-3'>
        <div className='flex items-center gap-3 px-2 py-2'>
          <span aria-hidden className='flex size-9 shrink-0 items-center justify-center bg-sidebar-accent text-sm font-semibold text-white'>
            {initialsOf(profile.fullName)}
          </span>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium text-white'>{profile.fullName}</p>
            <p className='truncate font-mono text-2xs text-sidebar-foreground/70'>{profile.email}</p>
          </div>
        </div>
        <SignOutButton variant='sidebar' className='mt-1 w-full' />
      </div>
    </div>
  );
}

/** PERSISTENT SIDEBAR FROM THE lg BREAKPOINT UP. */
export function AdminSidebar({ profile }: AdminSidebarProps) {
  return (
    <aside className='fixed inset-y-0 left-0 z-30 hidden w-64 lg:block print:hidden'>
      <SidebarContent profile={profile} />
    </aside>
  );
}

/** THE SAME NAVIGATION IN A DRAWER BELOW lg, OPENED FROM THE HEADER. */
export function AdminNavigationDrawer({ profile }: AdminSidebarProps) {
  const isNavigationOpen = adminShellStore((state) => state.isNavigationOpen);
  const setIsNavigationOpen = adminShellStore((state) => state.setIsNavigationOpen);

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
        <SheetDescription className='sr-only'>Admin portal sections</SheetDescription>
        <SidebarContent profile={profile} />
      </SheetContent>
    </Sheet>
  );
}
