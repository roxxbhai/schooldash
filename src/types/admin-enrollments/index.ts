import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** ONE ROW OF A CLASS ROSTER: THE ENROLLMENT AND ITS STUDENT (NULL ONLY IF THE STUDENT COULDN'T BE LOADED). */
export interface EnrollmentRow {
  enrollment: Enrollment;
  student: Student | null;
}
