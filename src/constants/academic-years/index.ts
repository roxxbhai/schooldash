import type { DbErrorContext } from '@/types/supabase';

export const ACADEMIC_YEAR_COLUMNS = 'id, name, startDate, endDate, isCurrent, createdAt, updatedAt';

export const ACADEMIC_YEAR_ERRORS: DbErrorContext = {
  notFoundMessage: 'Academic year not found.',
  constraints: {
    academicYears_name_key: { message: 'An academic year with this name already exists.', field: 'name' },
    academicYearsDateRange: { message: 'endDate must be after startDate.', field: 'endDate' },
    academicYearsSingleCurrentKey: { message: 'Another academic year is already current.' },
  },
};
