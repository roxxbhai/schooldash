import type { Metadata } from 'next';
import { AdminTeacherAssignments } from '@/components/admin-teacher-assignments';

export const metadata: Metadata = { title: 'Teacher assignments' };

export default function TeacherAssignmentsPage() {
  return <AdminTeacherAssignments />;
}
