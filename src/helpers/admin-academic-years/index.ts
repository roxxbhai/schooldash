import { shiftIsoDate } from '@/helpers/format';
import type { AcademicYearForm } from '@/constants/admin-academic-years';
import type { AcademicYear } from '@/types/academic-years';

/** THE INDIAN SCHOOL SESSION STARTS IN APRIL (MONTH 4). */
const SESSION_START_MONTH = 4;

/**
 * A NEW YEAR PREFILLED AS THE ONE AFTER THE LATEST EXISTING YEAR: IT STARTS THE DAY
 * AFTER THAT YEAR ENDS AND LASTS ONE YEAR. WITH NO YEARS YET, IT IS THE SESSION
 * (1 APRIL – 31 MARCH) THAT CONTAINS `today`. NAMED LIKE "2026-2027".
 */
export function suggestNextAcademicYear(years: readonly AcademicYear[], today: string): AcademicYearForm {
  const latestEndDate = years.reduce<string | null>((latest, year) => (latest === null || year.endDate > latest ? year.endDate : latest), null);
  const todayYear = Number(today.slice(0, 4));
  const sessionStartYear = Number(today.slice(5, 7)) >= SESSION_START_MONTH ? todayYear : todayYear - 1;
  const startDate = latestEndDate ? shiftIsoDate(latestEndDate, 1) : `${sessionStartYear}-04-01`;

  // ONE YEAR LATER, MINUS A DAY. Date.UTC ROLLS OVER IMPOSSIBLE DATES (E.G. 29 FEBRUARY).
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, startDay - 1)).toISOString().slice(0, 10);
  const endYear = Number(endDate.slice(0, 4));

  return { name: startYear === endYear ? String(startYear) : `${startYear}-${endYear}`, startDate, endDate };
}
