import { z } from 'zod';

export const CLASS_FORM_SCHEMA = z.object({
  academicYearId: z.string({ error: 'Choose the academic year.' }).min(1, { error: 'Choose the academic year.' }),
  name: z.string().trim().min(1, { error: 'Enter the class, like 10 or Nursery.' }).max(20, { error: 'Use at most 20 characters.' }),
  section: z.string().trim().min(1, { error: 'Enter the section, like A.' }).max(10, { error: 'Use at most 10 characters.' }),
  classTeacherId: z.string().nullable(),
  roomNumber: z.string().trim().max(20, { error: 'Use at most 20 characters.' }),
});

export type ClassForm = z.input<typeof CLASS_FORM_SCHEMA>;

export const EMPTY_CLASS_FORM: ClassForm = { academicYearId: '', name: '', section: '', classTeacherId: null, roomNumber: '' };
