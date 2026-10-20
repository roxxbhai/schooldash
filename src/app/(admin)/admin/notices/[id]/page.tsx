import type { Metadata } from 'next';
import { AdminNoticeDetail } from '@/components/admin-notice-detail';

export const metadata: Metadata = { title: 'Notice' };

/** THE CLIENT COMPONENT READS THE ID WITH useParams, SO THIS PAGE NEVER AWAITS `params`. */
export default function NoticeDetailPage() {
  return <AdminNoticeDetail />;
}
