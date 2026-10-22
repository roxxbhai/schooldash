import type { Metadata } from 'next';
import { TeacherMarks } from '@/components/teacher-marks';

export const metadata: Metadata = { title: 'Marks entry' };

export default function TeacherMarksPage() {
  return <TeacherMarks />;
}
