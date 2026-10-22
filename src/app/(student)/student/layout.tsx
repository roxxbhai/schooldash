import { Suspense } from 'react';
import { PortalGate } from '@/components/portal-gate';
import { PortalShellSkeleton } from '@/components/portal-shell-skeleton';

export default function StudentLayout({ children }: LayoutProps<'/student'>) {
  return (
    <Suspense fallback={<PortalShellSkeleton />}>
      <PortalGate role='STUDENT'>{children}</PortalGate>
    </Suspense>
  );
}
