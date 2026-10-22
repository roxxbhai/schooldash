import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const CLASS_COLUMNS = 'id, academicYearId, name, section, classTeacherId, roomNumber, createdAt, updatedAt';

export const CLASS_ERRORS: DbErrorContext = {
  notFoundMessage: 'Class not found.',
  constraints: {
    classesNameSectionPerYearKey: { message: 'A class with this name and section already exists in that academic year.' },
    classes_academicYearId_fkey: { message: 'Academic year not found.', field: 'academicYearId' },
    classes_classTeacherId_fkey: { message: 'Teacher not found.', field: 'classTeacherId' },
    classesNameGrade: { message: 'name must be a class from 1 to 12.', field: 'name' },
    classesSectionLetter: { message: 'section must be a capital letter from A to Z.', field: 'section' },
  },
};

/** CLASSES 1-12 AND SECTIONS A-Z, ENFORCED BY CHECK CONSTRAINTS (MIGRATION 18). */
export const CLASS_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;
export const CLASS_SECTIONS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;

export const CLASS_NAME_SCHEMA = z.enum(CLASS_GRADES, { error: 'name must be a class from 1 to 12.' });
export const CLASS_SECTION_SCHEMA = z.enum(CLASS_SECTIONS, { error: 'section must be a capital letter from A to Z.' });
