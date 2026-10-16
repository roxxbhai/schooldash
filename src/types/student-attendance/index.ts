import type { Tables } from '@/types/database';

export type StudentAttendance = Tables<'studentAttendance'>;

/** A CLASS WITH THE DATES OF ITS ACADEMIC YEAR. */
export interface ClassWithYear {
  id: string;
  academicYear: { startDate: string; endDate: string } | null;
}
