import { z } from 'zod';

/** MIRRORS THE API'S CHECKS SO MISTAKES SHOW BEFORE SENDING; THE SERVER VALIDATES AGAIN. */
export const ASSIGNMENT_FORM_SCHEMA = z.object({
  teacherId: z.string().min(1, { error: 'Choose the teacher.' }),
  classId: z.string().min(1, { error: 'Choose the class.' }),
  subjectId: z.string().min(1, { error: 'Choose the subject.' }),
});

export type AssignmentForm = z.input<typeof ASSIGNMENT_FORM_SCHEMA>;

export const EMPTY_ASSIGNMENT_FORM: AssignmentForm = { teacherId: '', classId: '', subjectId: '' };
