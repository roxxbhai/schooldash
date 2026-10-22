import { Suspense } from 'react';
import { PortalGate } from '@/components/portal-gate';
import { PortalShellSkeleton } from '@/components/portal-shell-skeleton';

export default function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  return (
    <Suspense fallback={<PortalShellSkeleton />}>
      <PortalGate role='TEACHER'>{children}</PortalGate>
    </Suspense>
  );
}
