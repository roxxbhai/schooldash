import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const SUBJECT_COLUMNS = 'id, code, name, description, createdAt, updatedAt';

export const SUBJECT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Subject not found.',
  constraints: {
    subjects_code_key: { message: 'A subject with this code already exists.', field: 'code' },
    subjectsCodeNotBlank: { message: 'code is required.', field: 'code' },
    subjectsNameNotBlank: { message: 'name is required.', field: 'name' },
  },
};

/** SUBJECT CODES ARE STORED UPPER-CASE, E.G. "MATH-10". */
export const SUBJECT_CODE_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, "code may contain only letters, numbers, '-' and '_'.")
  .transform((value) => value.toUpperCase());

export const SUBJECT_NAME_SCHEMA = z.string().trim().min(1).max(100);
