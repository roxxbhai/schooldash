import { Suspense } from 'react';
import { PortalGate } from '@/components/portal-gate';
import { PortalShellSkeleton } from '@/components/portal-shell-skeleton';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<PortalShellSkeleton />}>
      <PortalGate role='ADMIN'>{children}</PortalGate>
    </Suspense>
  );
}
