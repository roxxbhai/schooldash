import type { Metadata } from 'next';
import { AdminTeacherDetail } from '@/components/admin-teacher-detail';

export const metadata: Metadata = { title: 'Teacher' };

/** THE CLIENT COMPONENT READS THE ID WITH useParams; THE ADMIN LAYOUT'S SUSPENSE BOUNDARY COVERS IT. */
export default function TeacherDetailPage() {
  return <AdminTeacherDetail />;
}
