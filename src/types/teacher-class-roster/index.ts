import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** ONE STUDENT OF THE CLASS: ONLY WHAT TEACHING NEEDS IS SHOWN (ROLL, NAME, ADMISSION NUMBER). */
export interface RosterRow {
  enrollment: Enrollment;
  student: Student | null;
}
