import { z } from 'zod';
import { PHONE_NUMBER_SCHEMA } from '@/constants/phone';

/**
 * ONE SIGN-IN PER ROLE (MIGRATION 15):
 *   ADMINS    EMAIL + PASSWORD. NO SIGN-UP; NEW ADMINS GET A SETUP CODE FROM AN ADMIN.
 *   TEACHERS  PHONE NUMBER + PASSWORD. ONE-TIME SIGN-UP WITH THE NUMBER AN ADMIN REGISTERED.
 *   STUDENTS  ADMISSION NUMBER ONLY.
 */

/** THE 401 MESSAGE OF EACH SIGN-IN FORM. ONE MESSAGE PER FORM, SO NOTHING REVEALS WHICH PART WAS WRONG. */
export const SIGN_IN_FAILURE_MESSAGES = {
  ADMIN: 'The email or password is incorrect.',
  TEACHER: 'The phone number or password is incorrect.',
  STUDENT: 'No student has this admission number. Check it and try again.',
} as const;

export const TEACHER_NOT_FOUND_MESSAGE =
  'No teacher is registered with this phone number. Check the number, or ask the school office which number they registered.';

export const TEACHER_ALREADY_SIGNED_UP_MESSAGE =
  'This account is already set up. Sign in with your phone number and password, or ask the school office to reset your sign-up.';

const passwordField = z
  .string({ error: 'Password is required.' })
  .min(1, { error: 'Password is required.' })
  .max(1024, { error: 'Password is too long.' });

/** A PASSWORD SOMEONE CHOOSES (TEACHER SIGN-UP, ADMIN SETUP): 12–72 CHARACTERS (72 IS THE BCRYPT LIMIT). */
export const NEW_PASSWORD_SCHEMA = z
  .string({ error: 'Password is required.' })
  .min(12, { error: 'Use at least 12 characters.' })
  .max(72, { error: 'Use at most 72 characters.' });

// STRICT: UNKNOWN FIELDS SUCH AS `role` OR `userId` ARE REJECTED, NOT IGNORED.
export const ADMIN_SIGN_IN_SCHEMA = z.strictObject({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  password: passwordField,
});

export const TEACHER_SIGN_IN_SCHEMA = z.strictObject({ phone: PHONE_NUMBER_SCHEMA, password: passwordField });

export const TEACHER_SIGN_UP_SCHEMA = z.strictObject({ phone: PHONE_NUMBER_SCHEMA, password: NEW_PASSWORD_SCHEMA });

/** MATCHED EXACTLY (AFTER TRIMMING) AGAINST THE UNIQUE `students.admissionNumber`. */
export const STUDENT_SIGN_IN_SCHEMA = z.strictObject({
  admissionNumber: z
    .string({ error: 'Admission number is required.' })
    .trim()
    .min(1, { error: 'Admission number is required.' })
    .max(50, { error: 'Admission number is too long.' }),
});
