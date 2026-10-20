import { z } from 'zod';
import { EMAIL_FIELD, FULL_NAME_FIELD, OPTIONAL_DATE_FIELD } from '@/constants/people';

/** THE PROFILE FIELDS A TEACHER HAS BOTH WHEN CREATED AND WHEN EDITED. */
export const TEACHER_PROFILE_FIELDS = z.object({
  fullName: FULL_NAME_FIELD,
  employeeCode: z.string().trim().min(1, { error: 'Enter the employee code.' }).max(50, { error: 'Use at most 50 characters.' }),
  qualification: z.string().trim().max(200, { error: 'Use at most 200 characters.' }),
  dateOfJoining: OPTIONAL_DATE_FIELD,
});

/** A NEW TEACHER. NO PASSWORD: THE TEACHER CHOOSES ONE WITH A ONE-TIME SETUP CODE. */
export const TEACHER_FORM_SCHEMA = TEACHER_PROFILE_FIELDS.extend({ email: EMAIL_FIELD });

export type TeacherForm = z.input<typeof TEACHER_FORM_SCHEMA>;

export const EMPTY_TEACHER_FORM: TeacherForm = { fullName: '', email: '', employeeCode: '', qualification: '', dateOfJoining: '' };
