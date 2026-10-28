import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** A NEWLY ADDED STUDENT. `enrollment` IS NULL WHEN NO CLASS WAS CHOSEN, OR WHEN ENROLLING THEM FAILED AFTER THEY WERE ADDED. */
export type CreatedStudent = Student & { enrollment: Enrollment | null };
