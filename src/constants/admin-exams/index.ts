import { z } from 'zod';

/** BLANK, OR A CALENDAR DATE FROM AN <input type='date'>. */
const OPTIONAL_DATE = z.union([z.literal(''), z.iso.date({ error: 'Choose a valid date.' })]);

/** MIRRORS THE API'S CHECKS SO MISTAKES SHOW BEFORE SENDING; THE SERVER VALIDATES AGAIN (INCLUDING THE YEAR'S RANGE). */
export const EXAM_FORM_SCHEMA = z
  .object({
    academicYearId: z.string({ error: 'Choose the academic year.' }).min(1, { error: 'Choose the academic year.' }),
    name: z.string().trim().min(1, { error: 'Enter a name, like Term 1 or Half-yearly.' }).max(100, { error: 'Use at most 100 characters.' }),
    startDate: OPTIONAL_DATE,
    endDate: OPTIONAL_DATE,
  })
  .refine((form) => !form.startDate || !form.endDate || form.endDate >= form.startDate, {
    path: ['endDate'],
    error: "The last day can't be before the first day.",
  });

export type ExamForm = z.input<typeof EXAM_FORM_SCHEMA>;

export const EMPTY_EXAM_FORM: ExamForm = { academicYearId: '', name: '', startDate: '', endDate: '' };

/** "ALL YEARS" IN THE FILTER; `null` MEANS "NOT CHOSEN YET", WHICH FOLLOWS THE CURRENT YEAR. */
export const ALL_YEARS = 'all';
