import type { IssuedSetupCode } from '@/types/account-setup';
import type { Student } from '@/types/students';

/** POST /api/students: THE NEW STUDENT, PLUS ITS FIRST SETUP CODE (NULL WHEN ONE COULD NOT BE ISSUED). */
export type CreatedStudent = Student & { setupCode: IssuedSetupCode | null };
