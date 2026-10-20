import { z } from 'zod';
import { TEACHER_PROFILE_FIELDS } from '@/constants/admin-teachers';
import { PHONE_FIELD } from '@/constants/people';

/** EDITING A TEACHER. THE LOGIN EMAIL CANNOT CHANGE, SO IT IS NOT PART OF THE FORM. */
export const TEACHER_PROFILE_FORM_SCHEMA = TEACHER_PROFILE_FIELDS.extend({ phone: PHONE_FIELD });

export type TeacherProfileForm = z.input<typeof TEACHER_PROFILE_FORM_SCHEMA>;
