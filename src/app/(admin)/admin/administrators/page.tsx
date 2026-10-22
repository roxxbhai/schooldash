import type { Metadata } from 'next';
import { AdminAdministrators } from '@/components/admin-administrators';

export const metadata: Metadata = { title: 'Administrators' };

export default function AdministratorsPage() {
  return <AdminAdministrators />;
}
