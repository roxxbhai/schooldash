import 'server-only';
import type { ValidationIssue } from '@/types/api';

/**
 * AN EXAM'S OPTIONAL DATES MUST BE IN ORDER AND INSIDE ITS ACADEMIC YEAR.
 * RETURNS THE FIRST PROBLEM, OR NULL WHEN THE DATES ARE VALID.
 */
export function examDatesIssue(
  dates: { startDate?: string | null; endDate?: string | null },
  year: { startDate: string; endDate: string },
): ValidationIssue | null {
  const { startDate, endDate } = dates;
  if (startDate && endDate && endDate < startDate) return { path: 'endDate', message: 'endDate must not be before startDate.' };
  for (const [field, value] of [['startDate', startDate], ['endDate', endDate]] as const) {
    if (value && (value < year.startDate || value > year.endDate)) {
      return { path: field, message: "The date must be within the exam's academic year." };
    }
  }
  return null;
}
