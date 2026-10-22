import type { Exam } from '@/types/exams';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Notice } from '@/types/notices';
import type { TeacherAssignment } from '@/types/teacher-assignments';
import type { Teacher } from '@/types/teachers';
import type { TimetableEntry } from '@/types/timetable';

/** WHETHER A CLASS'S ATTENDANCE HAS BEEN MARKED TODAY. `markedCount` IS NULL IF THAT ONE COUNT COULD NOT BE LOADED. */
export interface ClassAttendanceToday {
  classId: string;
  markedCount: number | null;
}

/** AN EXAM PAPER THE TEACHER SETS MARKS FOR, WITH ITS EXAM. */
export interface UpcomingPaper {
  paper: ExamSubject;
  exam: Exam | null;
}

/** EVERYTHING ON THE TEACHER HOME PAGE, FROM REAL API RESPONSES ONLY. */
export interface TeacherOverview {
  teacher: Teacher;
  assignments: TeacherAssignment[];
  periodsToday: TimetableEntry[];
  attendanceToday: ClassAttendanceToday[];
  upcomingPapers: UpcomingPaper[];
  notices: Notice[];
}

export interface TeacherOverviewScope {
  teacherId: string;
  /** TODAY IN SCHOOL TIME, "YYYY-MM-DD". */
  today: string;
  currentAcademicYearId: string | null;
  /** THE CURRENT YEAR'S CLASSES THE TEACHER TEACHES (RLS-SCOPED REFERENCE DATA). */
  currentClassIds: readonly string[];
}
