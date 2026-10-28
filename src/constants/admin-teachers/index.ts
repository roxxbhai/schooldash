import { z } from 'zod';
import { FULL_NAME_FIELD, OPTIONAL_DATE_FIELD, OPTIONAL_EMAIL_FIELD } from '@/constants/people';
import { PHONE_NUMBER_SCHEMA } from '@/constants/phone';

/** THE PROFILE FIELDS A TEACHER HAS BOTH WHEN CREATED AND WHEN EDITED. NO EMPLOYEE CODE: THE SERVER ASSIGNS IT AND IT NEVER CHANGES. */
export const TEACHER_PROFILE_FIELDS = z.object({
  fullName: FULL_NAME_FIELD,
  /** THEY SIGN IN WITH THIS NUMBER. */
  phone: PHONE_NUMBER_SCHEMA,
  qualification: z.string().trim().max(200, { error: 'Use at most 200 characters.' }),
  dateOfJoining: OPTIONAL_DATE_FIELD,
});

/** A NEW TEACHER. NO PASSWORD: THE TEACHER CHOOSES ONE WHEN THEY SIGN UP WITH THEIR MOBILE NUMBER. */
export const TEACHER_FORM_SCHEMA = TEACHER_PROFILE_FIELDS.extend({ email: OPTIONAL_EMAIL_FIELD });

export type TeacherForm = z.input<typeof TEACHER_FORM_SCHEMA>;

export const EMPTY_TEACHER_FORM: TeacherForm = { fullName: '', email: '', phone: '', qualification: '', dateOfJoining: '' };
