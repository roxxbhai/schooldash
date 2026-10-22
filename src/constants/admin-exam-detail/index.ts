import { z } from 'zod';
import { isMarksText } from '@/helpers/marks';

const MARKS_FORMAT_MESSAGE = 'Enter a number with at most two decimals, like 100 or 80.5.';

/** MIRRORS THE API'S CHECKS (0 < maxMarks ≤ 9999.99, 0 ≤ passMarks ≤ maxMarks, TWO DECIMALS); THE SERVER VALIDATES AGAIN. */
export const PAPER_FORM_SCHEMA = z
  .object({
    classId: z.string().min(1, { error: 'Choose the class.' }),
    subjectId: z.string().min(1, { error: 'Choose the subject.' }),
    maxMarks: z
      .string()
      .trim()
      .refine(isMarksText, { error: MARKS_FORMAT_MESSAGE })
      .refine((value) => Number(value) > 0, { error: 'Max marks must be more than 0.' }),
    passMarks: z
      .string()
      .trim()
      .refine((value) => value === '' || isMarksText(value), { error: MARKS_FORMAT_MESSAGE }),
    examDate: z.union([z.literal(''), z.iso.date({ error: 'Choose a valid date.' })]),
  })
  .refine((form) => form.passMarks === '' || !isMarksText(form.maxMarks) || Number(form.passMarks) <= Number(form.maxMarks), {
    path: ['passMarks'],
    error: "Pass marks can't be more than max marks.",
  });

export type PaperForm = z.input<typeof PAPER_FORM_SCHEMA>;

/** MOST PAPERS ARE OUT OF 100, SO A NEW PAPER STARTS THERE. */
export const EMPTY_PAPER_FORM: PaperForm = { classId: '', subjectId: '', maxMarks: '100', passMarks: '', examDate: '' };

/** "ALL CLASSES" IN THE PAPERS FILTER. */
export const ALL_CLASSES = 'all';
