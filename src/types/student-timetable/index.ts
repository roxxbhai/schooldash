import type { Enrollment } from '@/types/enrollments';
import type { TimetableEntry } from '@/types/timetable';

/** THE STUDENT'S CLASS THIS YEAR AND ITS WEEKLY PERIODS; NO ENROLLMENT MEANS NO TIMETABLE YET. */
export interface StudentTimetable {
  enrollment: Enrollment | null;
  entries: TimetableEntry[];
}
