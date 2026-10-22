import type { Metadata } from 'next';
import { NoticeReader } from '@/components/notice-reader';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = { title: 'Notice' };

export default function TeacherNoticePage() {
  return <NoticeReader listPath={ROUTES.teacher.notices} />;
}
