import { AdminHeader } from '@/components/admin-header';
import { AdminNavigationDrawer, AdminSidebar } from '@/components/admin-sidebar';
import type { SessionProfile } from '@/types/auth';

interface AdminShellProps {
  profile: SessionProfile;
  children: React.ReactNode;
}

/** THE AUTHENTICATED ADMIN CHROME. RENDERED ONLY AFTER <AdminGate> HAS CONFIRMED AN ACTIVE ADMIN. */
export function AdminShell({ profile, children }: AdminShellProps) {
  return (
    <div className='min-h-dvh bg-background print:bg-white'>
      <a
        href='#main-content'
        className='sr-only z-50 bg-primary print:hidden px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        Skip to content
      </a>
      <AdminSidebar profile={profile} />
      <AdminNavigationDrawer profile={profile} />
      <div className='lg:pl-64 print:pl-0'>
        <AdminHeader profile={profile} />
        <main id='main-content' tabIndex={-1} className='mx-auto w-full max-w-[1440px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0'>
          {children}
        </main>
      </div>
    </div>
  );
}
