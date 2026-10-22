import { z } from 'zod';
import { CLASS_GRADES, CLASS_SECTIONS } from '@/constants/classes';
import type { SelectOption } from '@/types/reference-labels';

export const CLASS_FORM_SCHEMA = z.object({
  academicYearId: z.string({ error: 'Choose the academic year.' }).min(1, { error: 'Choose the academic year.' }),
  name: z.enum(CLASS_GRADES, { error: 'Choose the class.' }),
  section: z.enum(CLASS_SECTIONS, { error: 'Choose the section.' }),
  classTeacherId: z.string().nullable(),
  roomNumber: z.string().trim().max(20, { error: 'Use at most 20 characters.' }),
});

/** '' MEANS "NOT CHOSEN YET"; THE SCHEMA REJECTS IT WITH "Choose the class." / "Choose the section.". */
export type ClassForm = Omit<z.input<typeof CLASS_FORM_SCHEMA>, 'name' | 'section'> & { name: string; section: string };

export const EMPTY_CLASS_FORM: ClassForm = { academicYearId: '', name: '', section: '', classTeacherId: null, roomNumber: '' };

export const CLASS_GRADE_OPTIONS: SelectOption[] = CLASS_GRADES.map((grade) => ({ value: grade, label: `Class ${grade}` }));
export const CLASS_SECTION_OPTIONS: SelectOption[] = CLASS_SECTIONS.map((section) => ({ value: section, label: section }));
