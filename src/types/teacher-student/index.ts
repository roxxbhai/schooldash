import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** A STUDENT THE TEACHER TEACHES, AND THEIR ENROLLMENTS IN CLASSES THE TEACHER TEACHES (RLS). */
export interface TeacherStudentData {
  student: Student;
  enrollments: Enrollment[];
}
