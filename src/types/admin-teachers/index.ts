import type { IssuedSetupCode } from '@/types/account-setup';
import type { Teacher } from '@/types/teachers';

/** POST /api/teachers: THE NEW TEACHER, PLUS ITS FIRST SETUP CODE (NULL WHEN ONE COULD NOT BE ISSUED). */
export type CreatedTeacher = Teacher & { setupCode: IssuedSetupCode | null };
