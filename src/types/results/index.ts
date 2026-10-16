import type { Tables } from '@/types/database';

export type Result = Tables<'results'>;

/** ONE STUDENT'S MARK IN A SUBMISSION. */
export interface MarkEntry {
  studentId: string;
  marksObtained: number;
}
