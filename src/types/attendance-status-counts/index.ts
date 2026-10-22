import type { AttendanceStatus } from '@/types/admin-attendance';

/** HOW MANY DAYS OF EACH STATUS, OR NULL FOR A COUNT THAT COULD NOT BE LOADED. NO PERCENTAGE: THE SCHOOL HAS NO RULE FOR ONE. */
export type AttendanceStatusCounts = Record<AttendanceStatus, number | null>;
