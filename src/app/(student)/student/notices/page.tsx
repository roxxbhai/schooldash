import type { Metadata } from 'next';
import { NoticeFeed } from '@/components/notice-feed';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Notices' };

export default function StudentNoticesPage() {
  return <NoticeFeed basePath={ROUTES.student.notices} />;
}
