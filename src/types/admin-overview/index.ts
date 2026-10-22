import type { StatusTone } from '@/components/status-badge';
import type { AcademicYear } from '@/types/academic-years';
import type { AdminNotice } from '@/types/admin-notices';
import type { SchoolClass } from '@/types/classes';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Exam } from '@/types/exams';
import type { Result } from '@/types/results';
import type { Subject } from '@/types/subjects';
import type { Teacher } from '@/types/teachers';

/** WHAT THE "TODAY" PAGE IS BUILT FROM: TODAY'S DATE AND THE REFERENCE DATA ALREADY IN THE STORE. */
export interface OverviewScope {
  /** TODAY IN SCHOOL TIME, "YYYY-MM-DD". */
  today: string;
  /** ISO WEEKDAY, 1 = MONDAY. */
  dayOfWeek: number;
  year: AcademicYear | null;
  /** THE CURRENT YEAR'S CLASSES. */
  classes: readonly SchoolClass[];
  subjects: readonly Subject[];
  classById: ReadonlyMap<string, SchoolClass>;
  subjectById: ReadonlyMap<string, Subject>;
  teacherById: ReadonlyMap<string, Teacher>;
}

/** ONE CLASS'S FIGURES FOR TODAY. NULL WHEN THAT REQUEST FAILED (OR, FOR ATTENDANCE, ON A NON-SCHOOL DAY). */
export interface ClassStatus {
  schoolClass: SchoolClass;
  enrolled: number | null;
  markedToday: number | null;
  periods: number | null;
}

/** ONE EXAM OF THE CURRENT YEAR WITH ITS PAPERS AND HOW MANY MARKS ARE IN. */
export interface ExamStatus {
  exam: Exam;
  papers: ExamSubject[] | null;
  resultCount: number | null;
}

/** THE MARKS OF THE MOST RECENT EXAM THAT HAS ANY, FOR THE RESULTS SNAPSHOT. */
export interface SnapshotSource {
  exam: Exam;
  papers: ExamSubject[];
  results: Result[];
  studentNames: ReadonlyMap<string, string>;
}

/** EVERYTHING THE LOADER FETCHED. EACH FIGURE IS REAL, OR NULL IF ITS REQUEST FAILED. */
export interface OverviewSource {
  activeStudents: number | null;
  activeTeachers: number | null;
  liveNotices: number | null;
  draftNotices: AdminNotice[] | null;
  teachersMarkedToday: number | null;
  isSchoolDay: boolean;
  classStatuses: ClassStatus[];
  examStatuses: ExamStatus[] | null;
  snapshot: SnapshotSource | null;
}

export type AttentionTone = 'warning' | 'info';

/** SOMETHING THAT NEEDS AN ADMIN, WITH THE ONE ACTION THAT RESOLVES IT. */
export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

/** SOMETHING ALREADY TAKEN CARE OF, SHOWN SO PROGRESS IS VISIBLE. */
export interface DoneItem {
  id: string;
  title: string;
  detail: string;
}

/** A DATED EVENT IN THE "COMING UP" TIMELINE. */
export interface UpcomingItem {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  title: string;
  detail: string;
  tag: { label: string; tone: StatusTone } | null;
  href: string;
}

export interface SubjectSummary {
  subjectId: string;
  label: string;
  averagePercent: number;
  belowPassCount: number;
}

export interface TopStudent {
  studentId: string;
  name: string;
  classLabel: string;
  averagePercent: number;
}

/** HOW THE LATEST EXAM WENT, ACROSS EVERY MARK ENTERED FOR IT. */
export interface ExamSnapshot {
  examId: string;
  examName: string;
  /** "5 – A" WHEN THE EXAM COVERS ONE CLASS; NULL FOR SEVERAL. */
  classScope: string | null;
  averagePercent: number;
  resultCount: number;
  passedCount: number;
  subjects: SubjectSummary[];
  topStudents: TopStudent[];
}

export interface YearCounts {
  students: number | null;
  teachers: number | null;
  classes: number | null;
  subjects: number | null;
  exams: number | null;
  liveNotices: number | null;
}

export interface TodayOverview {
  attention: AttentionItem[];
  done: DoneItem[];
  upcoming: UpcomingItem[];
  snapshot: ExamSnapshot | null;
  counts: YearCounts;
}
