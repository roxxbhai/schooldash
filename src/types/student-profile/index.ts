import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** THE STUDENT'S OWN RECORD AND EVERY YEAR THEY WERE ENROLLED, NEWEST FIRST. */
export interface StudentProfile {
  student: Student;
  enrollments: Enrollment[];
}
