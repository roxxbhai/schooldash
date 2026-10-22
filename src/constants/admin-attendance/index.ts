import type { StatusTone } from '@/components/status-badge';
import type { AttendanceRowState, AttendanceStatusOption } from '@/types/admin-attendance';

/** THE FOUR STATUSES, IN THE ORDER THE TOGGLE SHOWS THEM. VALUES ARE THE DATABASE ENUM EXACTLY. */
export const ATTENDANCE_STATUS_OPTIONS: readonly AttendanceStatusOption[] = [
  { value: 'present', label: 'Present', tone: 'success' },
  { value: 'absent', label: 'Absent', tone: 'danger' },
  { value: 'late', label: 'Late', tone: 'warning' },
  { value: 'leave', label: 'On leave', tone: 'info' },
];

/** SELECTED-BUTTON COLOURS PER TONE (SOFT FILL, STRONG TEXT, MATCHING BORDER). */
export const ATTENDANCE_TONE_SELECTED_CLASSES: Record<StatusTone, string> = {
  success: 'border-success bg-success-soft text-success',
  danger: 'border-destructive bg-destructive-soft text-destructive',
  warning: 'border-warning bg-warning-soft text-warning',
  info: 'border-info bg-info-soft text-info',
  neutral: 'border-border bg-muted text-foreground',
  brand: 'border-primary bg-secondary text-secondary-foreground',
};

export const ATTENDANCE_ROW_STATE_BADGES: Record<AttendanceRowState, { label: string; tone: StatusTone }> = {
  saved: { label: 'Saved', tone: 'success' },
  'not-marked': { label: 'Not marked', tone: 'neutral' },
  changed: { label: 'Changed', tone: 'warning' },
};

/** HOW MANY SINGLE-RECORD REQUESTS (POST/PATCH) RUN AT ONCE WHILE SAVING. */
export const ATTENDANCE_SAVE_CONCURRENCY = 4;

/** THE API'S LIMIT FOR `remarks`. */
export const ATTENDANCE_REMARKS_MAX_LENGTH = 500;

/** EMPTY-STATE WORDING PER PORTAL FOR THE STUDENT REGISTER. */
export const STUDENT_REGISTER_PORTAL_COPY = {
  ADMIN: {
    title: 'Student attendance',
    noYear: 'Classes, and so their registers, belong to an academic year.',
    noYearTitle: 'Create an academic year first',
    noClasses: 'Add classes from the Classes page, then come back to take attendance.',
    noStudents: 'Enroll students into this class from the Enrollments page.',
  },
  TEACHER: {
    title: 'Attendance',
    noYear: 'The school office hasn’t set up an academic year yet.',
    noYearTitle: 'No academic year yet',
    noClasses: 'You don’t teach any class in this year. The school office assigns classes.',
    noStudents: 'The school office enrolls students into classes.',
  },
} as const;
