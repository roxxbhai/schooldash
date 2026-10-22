import { z } from 'zod';
import { SUBJECT_NAME_PATTERN } from '@/constants/subjects';
import { normalizeSubjectName } from '@/helpers/subjects';

/** NO CODE: THE DATABASE ASSIGNS IT (MIGRATION 18). THE NAME IS SENT NORMALIZED, AS IT WILL BE STORED. */
export const SUBJECT_FORM_SCHEMA = z.object({
  name: z
    .string()
    .transform(normalizeSubjectName)
    .pipe(
      z
        .string()
        .min(1, { error: 'Enter the subject name.' })
        .max(100, { error: 'Use at most 100 characters.' })
        .regex(SUBJECT_NAME_PATTERN, { error: 'Use only letters, numbers and spaces.' }),
    ),
  description: z.string().trim().max(500, { error: 'Use at most 500 characters.' }),
});

export type SubjectForm = z.input<typeof SUBJECT_FORM_SCHEMA>;

export const EMPTY_SUBJECT_FORM: SubjectForm = { name: '', description: '' };
