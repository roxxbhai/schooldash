import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const CLASS_COLUMNS = 'id, academicYearId, name, section, classTeacherId, roomNumber, createdAt, updatedAt';

export const CLASS_ERRORS: DbErrorContext = {
  notFoundMessage: 'Class not found.',
  constraints: {
    classesNameSectionPerYearKey: { message: 'A class with this name and section already exists in that academic year.' },
    classes_academicYearId_fkey: { message: 'Academic year not found.', field: 'academicYearId' },
    classes_classTeacherId_fkey: { message: 'Teacher not found.', field: 'classTeacherId' },
  },
};

export const CLASS_NAME_SCHEMA = z.string().trim().min(1).max(20);
export const CLASS_SECTION_SCHEMA = z.string().trim().min(1).max(10);
