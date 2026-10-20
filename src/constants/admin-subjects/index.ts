import { z } from 'zod';

export const SUBJECT_FORM_SCHEMA = z.object({
  code: z
    .string()
    .trim()
    .min(1, { error: 'Enter a short code, like MATH or ENG-10.' })
    .max(20, { error: 'Use at most 20 characters.' })
    .regex(/^[A-Za-z0-9_-]+$/, { error: "Use only letters, numbers, '-' and '_'." }),
  name: z.string().trim().min(1, { error: 'Enter the subject name.' }).max(100, { error: 'Use at most 100 characters.' }),
  description: z.string().trim().max(500, { error: 'Use at most 500 characters.' }),
});

export type SubjectForm = z.input<typeof SUBJECT_FORM_SCHEMA>;

export const EMPTY_SUBJECT_FORM: SubjectForm = { code: '', name: '', description: '' };
