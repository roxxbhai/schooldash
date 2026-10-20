import { Suspense } from 'react';
import { AdminGate } from '@/components/admin-gate';
import { AdminShellSkeleton } from '@/components/admin-shell-skeleton';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
