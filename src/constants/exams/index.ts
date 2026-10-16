import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const EXAM_COLUMNS = 'id, academicYearId, name, startDate, endDate, createdAt, updatedAt';

export const EXAM_ERRORS: DbErrorContext = {
  notFoundMessage: 'Exam not found.',
  constraints: {
    examsNamePerYearKey: { message: 'An exam with this name already exists in that academic year.', field: 'name' },
    exams_academicYearId_fkey: { message: 'Academic year not found.', field: 'academicYearId' },
    examsDateRange: { message: 'endDate must not be before startDate.', field: 'endDate' },
    examsNameNotBlank: { message: 'name is required.', field: 'name' },
  },
};

export const EXAM_NAME_SCHEMA = z.string().trim().min(1).max(100);
