import { z } from 'zod';
import { STUDENT_PROFILE_FIELDS } from '@/constants/admin-students';
import { PHONE_FIELD } from '@/constants/people';

/** EDITING A STUDENT. THE LOGIN EMAIL CANNOT CHANGE, SO IT IS NOT PART OF THE FORM. */
export const STUDENT_PROFILE_FORM_SCHEMA = STUDENT_PROFILE_FIELDS.extend({ phone: PHONE_FIELD });

export type StudentProfileForm = z.input<typeof STUDENT_PROFILE_FORM_SCHEMA>;
