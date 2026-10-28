import { z } from 'zod';
import type { SelectOption } from '@/types/reference-labels';

/** FORM FIELDS SHARED BY THE TEACHER AND STUDENT FORMS. LIMITS MATCH THE API SCHEMAS. */

export const FULL_NAME_FIELD = z.string().trim().min(1, { error: 'Enter their full name.' }).max(200, { error: 'Use at most 200 characters.' });

/** STUDENTS AND TEACHERS DON'T SIGN IN WITH AN EMAIL, SO IT IS OPTIONAL: BLANK, OR A VALID ADDRESS. */
export const OPTIONAL_EMAIL_FIELD = z
  .string()
  .trim()
  .pipe(z.union([z.literal(''), z.email({ error: 'Enter a valid email address, like name@example.com.' })]));

export const PHONE_FIELD = z.string().trim().max(30, { error: 'Use at most 30 characters.' });

/** A DATE INPUT IS EITHER EMPTY OR "YYYY-MM-DD". */
export const OPTIONAL_DATE_FIELD = z.union([z.literal(''), z.iso.date()], { error: 'Enter a valid date.' });

/** THE STATUS FILTER ON PEOPLE LISTS; THE VALUE IS SENT AS ?isActive=. NO VALUE MEANS EVERYONE. */
export const ACCOUNT_STATUS_OPTIONS: SelectOption[] = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];
