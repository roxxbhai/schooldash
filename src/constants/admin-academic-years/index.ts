import { z } from 'zod';

/** MIRRORS THE API'S CHECKS SO MISTAKES SHOW BEFORE SENDING; THE SERVER VALIDATES AGAIN. */
export const ACADEMIC_YEAR_FORM_SCHEMA = z
  .object({
    name: z.string().trim().min(1, { error: 'Enter a name, like 2026–27.' }).max(50, { error: 'Use at most 50 characters.' }),
    startDate: z.iso.date({ error: 'Choose the first day of the year.' }),
    endDate: z.iso.date({ error: 'Choose the last day of the year.' }),
  })
  .refine((form) => form.endDate > form.startDate, { path: ['endDate'], error: 'The end date must be after the start date.' });

export type AcademicYearForm = z.input<typeof ACADEMIC_YEAR_FORM_SCHEMA>;

export const EMPTY_ACADEMIC_YEAR_FORM: AcademicYearForm = { name: '', startDate: '', endDate: '' };
