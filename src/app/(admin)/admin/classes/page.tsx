import type { Metadata } from 'next';
import { AdminClasses } from '@/components/admin-classes';

export const metadata: Metadata = { title: 'Classes' };

export default function ClassesPage() {
  return <AdminClasses />;
}
