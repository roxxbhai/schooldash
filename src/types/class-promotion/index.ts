import type { z } from 'zod';
import type { GRADUATION_RESULT_SCHEMA, PROMOTION_OPTIONS_SCHEMA, PROMOTION_RESULT_SCHEMA, SKIP_REASONS } from '@/constants/class-promotion';
import type { Enrollment } from '@/types/enrollments';
import type { Student } from '@/types/students';

/** GET /api/classes/[id]/promotion. */
export type PromotionOptions = z.output<typeof PROMOTION_OPTIONS_SCHEMA>;
export type PromotionClass = PromotionOptions['classes'][number];
export type PromotionMove = PromotionOptions['moves'][number];

export type SkipReason = (typeof SKIP_REASONS)[number];
export interface SkippedStudent {
  studentId: string;
  reason: SkipReason;
  classId?: string;
}

/** POST /api/classes/[id]/promote (A ROLL NUMBER CONFLICT IS A 422, NOT A RESULT). */
export type PromotionResult = Extract<z.output<typeof PROMOTION_RESULT_SCHEMA>, { status: 'promoted' }>;

/** POST /api/classes/[id]/graduate. */
export type GraduationResult = z.output<typeof GRADUATION_RESULT_SCHEMA>;

/** ONE STUDENT AS SENT TO THE PROMOTE ENDPOINT. */
export interface PromotionStudentInput {
  studentId: string;
  rollNumber: number | null;
}

/** A ROW OF A CLASS ROSTER, AS BOTH THE ADMIN AND THE TEACHER ROSTERS HOLD IT. */
export interface PromotionRosterRow {
  enrollment: Enrollment;
  student: Student | null;
}

/** WHERE A STUDENT STANDS FOR PROMOTION: STILL TO MOVE, ALREADY MOVED, GRADUATED, OR NOT MOVABLE (INACTIVE / NOT LOADED). */
export type PromotionStanding =
  | { kind: 'eligible' }
  | { kind: 'moved'; move: PromotionMove }
  | { kind: 'graduated'; graduatedOn: string }
  | { kind: 'unavailable'; reason: 'inactive' | 'unknown' };

/** WHERE THE SELECTED STUDENTS GO: A CLASS THAT EXISTS, THE NEXT CLASS TO CREATE FIRST, OR GRADUATION. */
export type PromotionTarget =
  | { kind: 'class'; classId: string }
  | { kind: 'newClass'; academicYearId: string; name: string; section: string }
  | { kind: 'graduate' };
