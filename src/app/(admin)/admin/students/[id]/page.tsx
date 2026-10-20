import type { Metadata } from 'next';
import { AdminStudentDetail } from '@/components/admin-student-detail';

export const metadata: Metadata = { title: 'Student' };

/** THE CLIENT COMPONENT READS THE ID WITH useParams; THE ADMIN LAYOUT'S SUSPENSE BOUNDARY COVERS IT. */
export default function StudentDetailPage() {
  return <AdminStudentDetail />;
}
