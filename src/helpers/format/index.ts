/**
 * DISPLAY FORMATTING. DATES FROM THE API ARE ISO STRINGS: CALENDAR DATES AS
 * "YYYY-MM-DD" AND TIMESTAMPS WITH A TIME ZONE. THE SCHOOL IS IN INDIA, SO
 * "TODAY" AND TIMESTAMPS ARE SHOWN IN ASIA/KOLKATA.
 */

export const SCHOOL_TIME_ZONE = 'Asia/Kolkata';
const LOCALE = 'en-IN';

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: SCHOOL_TIME_ZONE });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE });
const ISO_DATE_IN_SCHOOL_ZONE = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: SCHOOL_TIME_ZONE });
const NUMBER_FORMAT = new Intl.NumberFormat(LOCALE);
const MARKS_FORMAT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

export const WEEKDAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
] as const;

/** "Asha Verma" → "AV"; ONE NAME → ITS FIRST TWO LETTERS. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** "2026-10-20" → "20 Oct 2026". A CALENDAR DATE HAS NO TIME ZONE, SO IT IS FORMATTED AS UTC TO NEVER SHIFT A DAY. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

/** A TIMESTAMP IN SCHOOL TIME: "20 Oct 2026, 9:05 am". */
export function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMAT.format(date);
}

/** "Tuesday, 20 October 2026" FOR TODAY IN SCHOOL TIME. */
export function formatLongToday(now = new Date()): string {
  return LONG_DATE_FORMAT.format(now);
}

/** TODAY'S CALENDAR DATE IN SCHOOL TIME, AS "YYYY-MM-DD". */
export function todayInSchool(now = new Date()): string {
  return ISO_DATE_IN_SCHOOL_ZONE.format(now);
}

/** "09:05:00" → "09:05". */
export function formatTime(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '—';
}

/** "YYYY-MM-DD" MOVED BY `days` CALENDAR DAYS (NEGATIVE GOES BACK). */
export function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO WEEKDAY (1 = MONDAY … 7 = SUNDAY) OF A "YYYY-MM-DD" DATE, AS THE TIMETABLE COUNTS DAYS. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAYS.find((day) => day.value === dayOfWeek)?.label ?? '—';
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : NUMBER_FORMAT.format(value);
}

/** MARKS KEEP UP TO TWO DECIMALS: 87.5 → "87.5". */
export function formatMarks(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(number) ? '—' : MARKS_FORMAT.format(number);
}

/** "1 student" / "3 students". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
