import type { Metadata } from 'next';
import { AdminOverview } from '@/components/admin-overview';

export const metadata: Metadata = { title: 'Dashboard' };

export default function AdminOverviewPage() {
  return <AdminOverview />;
}
