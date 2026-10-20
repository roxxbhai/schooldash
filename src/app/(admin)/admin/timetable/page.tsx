import type { Metadata } from 'next';
import { AdminTimetable } from '@/components/admin-timetable';

export const metadata: Metadata = { title: 'Timetable' };

export default function TimetablePage() {
  return <AdminTimetable />;
}
