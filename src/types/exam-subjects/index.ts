import type { Tables } from '@/types/database';

/** AN EXAM PAPER: ONE SUBJECT OF AN EXAM, FOR ONE CLASS. */
export type ExamSubject = Tables<'examSubjects'>;

export type ExamPaperWithSubject = ExamSubject & { subject: { code: string; name: string } | null };
