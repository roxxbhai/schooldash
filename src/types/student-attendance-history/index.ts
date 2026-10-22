import type { AttendanceStatus } from '@/types/admin-attendance';

/** THE DATE RANGE ("YYYY-MM-DD", BOTH INCLUSIVE) AND OPTIONAL STATUS THE HISTORY SHOWS. */
export interface AttendanceHistoryFilters {
  from: string;
  to: string;
  status: AttendanceStatus | null;
}
