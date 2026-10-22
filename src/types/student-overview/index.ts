import type { AcademicYear } from '@/types/academic-years';
import type { Enrollment } from '@/types/enrollments';
import type { Notice } from '@/types/notices';
import type { ReportCard } from '@/types/report-cards';
import type { AttendanceStatusCounts } from '@/types/attendance-status-counts';
import type { Student } from '@/types/students';
import type { TimetableEntry } from '@/types/timetable';

/** EVERYTHING ON THE STUDENT HOME PAGE, FROM REAL API RESPONSES ONLY. */
export interface StudentOverview {
  student: Student;
  /** THIS YEAR'S CLASS AND ROLL NUMBER; NULL IF NOT ENROLLED THIS YEAR. */
  enrollment: Enrollment | null;
  periodsToday: TimetableEntry[];
  attendance: AttendanceStatusCounts | null;
  /** THE REPORT CARD OF THE MOST RECENT EXAM THAT HAS STARTED, IF ANY. */
  latestReportCard: ReportCard | null;
  notices: Notice[];
}

export interface StudentOverviewScope {
  studentId: string;
  /** TODAY IN SCHOOL TIME, "YYYY-MM-DD". */
  today: string;
  currentAcademicYear: AcademicYear | null;
}
