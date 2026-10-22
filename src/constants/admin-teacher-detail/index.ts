import { z } from 'zod';
import { TEACHER_PROFILE_FIELDS } from '@/constants/admin-teachers';

/** EDITING A TEACHER. THE EMAIL CANNOT CHANGE, SO IT IS NOT PART OF THE FORM; THE SIGN-IN MOBILE NUMBER CAN. */
export const TEACHER_PROFILE_FORM_SCHEMA = TEACHER_PROFILE_FIELDS;

export type TeacherProfileForm = z.input<typeof TEACHER_PROFILE_FORM_SCHEMA>;
