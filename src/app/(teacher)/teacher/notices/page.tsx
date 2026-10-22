import type { Metadata } from 'next';
import { NoticeFeed } from '@/components/notice-feed';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Notices' };

export default function TeacherNoticesPage() {
  return <NoticeFeed basePath={ROUTES.teacher.notices} />;
}
