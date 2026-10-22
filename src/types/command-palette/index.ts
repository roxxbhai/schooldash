import type { Student } from '@/types/students';
import type { Teacher } from '@/types/teachers';

/** PEOPLE MATCHING A SEARCH IN THE COMMAND PALETTE (ADMINS ONLY). */
export interface PeopleMatches {
  students: Student[];
  teachers: Teacher[];
}
