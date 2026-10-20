import type { Metadata } from 'next';
import { AdminNotices } from '@/components/admin-notices';

export const metadata: Metadata = { title: 'Notices' };

export default function NoticesPage() {
  return <AdminNotices />;
}
