import { z } from 'zod';

/** THE API'S ROLL NUMBER LIMITS (ROLL_NUMBER_SCHEMA: A POSITIVE WHOLE NUMBER UP TO 100000). */
const MAX_ROLL_NUMBER = 100000;

/** A TEXT BOX VALUE → A ROLL NUMBER, OR NULL WHEN LEFT EMPTY. */
const ROLL_NUMBER_FIELD = z
  .string()
  .trim()
  .refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_ROLL_NUMBER), {
    error: `Enter a whole number from 1 to ${MAX_ROLL_NUMBER}, or leave it empty.`,
  })
  .transform((value) => (value === '' ? null : Number(value)));

/** MIRRORS THE API'S CHECKS SO MISTAKES SHOW BEFORE SENDING; THE SERVER VALIDATES AGAIN. */
export const ENROLL_FORM_SCHEMA = z.object({
  studentId: z.string().min(1, { error: 'Choose a student.' }),
  classId: z.string().min(1, { error: 'Choose the class.' }),
  rollNumber: ROLL_NUMBER_FIELD,
});

export type EnrollForm = z.input<typeof ENROLL_FORM_SCHEMA>;
export type EnrollValues = z.output<typeof ENROLL_FORM_SCHEMA>;

export const EMPTY_ENROLL_FORM: EnrollForm = { studentId: '', classId: '', rollNumber: '' };

export const EDIT_ENROLLMENT_FORM_SCHEMA = z.object({
  classId: z.string().min(1, { error: 'Choose the class.' }),
  rollNumber: ROLL_NUMBER_FIELD,
});

export type EditEnrollmentForm = z.input<typeof EDIT_ENROLLMENT_FORM_SCHEMA>;
export type EditEnrollmentValues = z.output<typeof EDIT_ENROLLMENT_FORM_SCHEMA>;

export const EMPTY_EDIT_ENROLLMENT_FORM: EditEnrollmentForm = { classId: '', rollNumber: '' };
