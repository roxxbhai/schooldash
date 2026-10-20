import type { Exam } from '@/types/exams';

/** EACH FIGURE IS A REAL COUNT FROM THE API, OR NULL IF THAT ONE REQUEST FAILED. */
export interface OverviewMetrics {
  activeStudents: number | null;
  activeTeachers: number | null;
  publishedNotices: number | null;
  draftNotices: number | null;
  studentAttendance: { marked: number | null; present: number | null; late: number | null; absent: number | null; leave: number | null };
  teacherAttendance: { marked: number | null; present: number | null; absent: number | null };
  periodsToday: number | null;
  exams: Exam[] | null;
}
