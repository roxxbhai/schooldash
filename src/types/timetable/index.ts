import type { Tables } from '@/types/database';

export type TimetableEntry = Tables<'timetableEntries'>;

/** WHO TEACHES A PERIOD: A CLASS, A SUBJECT, AND AN OPTIONAL TEACHER. */
export interface PeriodStaffing {
  classId: string;
  subjectId: string;
  teacherId: string | null;
}
