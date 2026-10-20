import { formatDate } from '@/helpers/format';
import type { AcademicYear } from '@/types/academic-years';
import type { FieldErrors } from '@/types/api-client';

/** "4 Mar 2027 – 18 Mar 2027", "From 4 Mar 2027", "Until 18 Mar 2027" OR NULL WHEN NO DATES ARE SET. */
export function examDatesLabel(exam: { startDate: string | null; endDate: string | null }): string | null {
  if (exam.startDate && exam.endDate) return `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`;
  if (exam.startDate) return `From ${formatDate(exam.startDate)}`;
  if (exam.endDate) return `Until ${formatDate(exam.endDate)}`;
  return null;
}

/** EXAM DATES MUST FALL INSIDE THE ACADEMIC YEAR (THE SERVER CHECKS AGAIN). BLANK DATES ARE FINE. */
export function examDatesOutsideYear(dates: { startDate: string; endDate: string }, year: AcademicYear | undefined): FieldErrors {
  const errors: FieldErrors = {};
  if (!year) return errors;
  const message = `Choose a date within ${year.name} (${formatDate(year.startDate)} – ${formatDate(year.endDate)}).`;
  if (dates.startDate && (dates.startDate < year.startDate || dates.startDate > year.endDate)) errors.startDate = message;
  if (dates.endDate && (dates.endDate < year.startDate || dates.endDate > year.endDate)) errors.endDate = message;
  return errors;
}

/** THE DAYS A PAPER CAN BE SAT, AS THE SERVER CHECKS IT: THE EXAM'S DATES WHEN BOTH ARE SET, OTHERWISE THE ACADEMIC YEAR. */
export function paperDateWindow(
  exam: { startDate: string | null; endDate: string | null },
  year: AcademicYear | undefined,
): { min: string | undefined; max: string | undefined; label: string } {
  if (exam.startDate && exam.endDate) return { min: exam.startDate, max: exam.endDate, label: "the exam's dates" };
  return { min: year?.startDate, max: year?.endDate, label: year ? year.name : 'the academic year' };
}
