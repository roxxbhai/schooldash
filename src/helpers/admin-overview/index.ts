import { EXAM_SOON_DAYS, MAX_SEPARATE_CLASS_ITEMS, MAX_SEPARATE_DRAFTS, MAX_UPCOMING_ITEMS, TOP_STUDENT_COUNT } from '@/constants/admin-overview';
import { ROUTES } from '@/constants/routes';
import { audienceSummary, noticeDetailPath } from '@/helpers/admin-notices';
import { formatDate, pluralize, SCHOOL_TIME_ZONE, shiftIsoDate } from '@/helpers/format';
import { classLabel, sortClasses, subjectLabel, teacherLabel } from '@/helpers/reference-labels';
import type {
  AttentionItem,
  ClassStatus,
  DoneItem,
  ExamSnapshot,
  ExamStatus,
  OverviewScope,
  OverviewSource,
  SnapshotSource,
  TodayOverview,
  UpcomingItem,
} from '@/types/admin-overview';
import type { SchoolClass } from '@/types/classes';

const HOUR_IN_SCHOOL = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: SCHOOL_TIME_ZONE });
const WEEKDAY_DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: SCHOOL_TIME_ZONE });
const SHORT_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

/** "Good morning" BEFORE NOON, "Good afternoon" UNTIL 5 PM, THEN "Good evening" (SCHOOL TIME). */
export function greetingFor(now = new Date()): string {
  const hour = Number(HOUR_IN_SCHOOL.format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Thursday, 22 October" (SCHOOL TIME). */
export function formatWeekdayDate(now = new Date()): string {
  return WEEKDAY_DATE.format(now);
}

/** "Sameer Poswal" → "Sameer". */
export function firstName(fullName: string | null): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

/** "2026-10-31" → { month: "Oct", day: "31" }, FOR THE TIMELINE'S DATE BLOCKS. */
export function dateBlock(isoDate: string): { month: string; day: string } {
  return { month: SHORT_MONTH.format(new Date(`${isoDate}T00:00:00Z`)), day: String(Number(isoDate.slice(8, 10))) };
}

/** RUNS `task` OVER `items`, AT MOST `size` AT A TIME, KEEPING THE INPUT ORDER. */
export async function mapInBatches<T, R>(items: readonly T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(task))));
  }
  return results;
}

/** "5 – A, 6 – B and 4 more". */
function classList(classes: readonly SchoolClass[]): string {
  const labels = sortClasses(classes).map(classLabel);
  if (labels.length <= MAX_SEPARATE_CLASS_ITEMS) return labels.join(', ');
  return `${labels.slice(0, MAX_SEPARATE_CLASS_ITEMS).join(', ')} and ${labels.length - MAX_SEPARATE_CLASS_ITEMS} more`;
}

function sortStatuses(statuses: readonly ClassStatus[]): ClassStatus[] {
  const order = new Map(sortClasses(statuses.map((status) => status.schoolClass)).map((schoolClass, index) => [schoolClass.id, index]));
  return [...statuses].sort((first, second) => (order.get(first.schoolClass.id) ?? 0) - (order.get(second.schoolClass.id) ?? 0));
}

/** TODAY'S STUDENT REGISTERS: ONE ITEM PER UNFINISHED CLASS (GROUPED WHEN THERE ARE MANY), AND WHAT'S DONE. */
function studentAttendanceItems(scope: OverviewScope, source: OverviewSource, attention: AttentionItem[], done: DoneItem[]) {
  if (!source.isSchoolDay) return;
  const withStudents = sortStatuses(source.classStatuses).filter((status) => (status.enrolled ?? 0) > 0 && status.markedToday !== null);
  const unfinished = withStudents.filter((status) => (status.markedToday ?? 0) < (status.enrolled ?? 0));
  const finished = withStudents.filter((status) => (status.markedToday ?? 0) >= (status.enrolled ?? 0));

  if (unfinished.length > MAX_SEPARATE_CLASS_ITEMS) {
    attention.push({
      id: 'attendance-students',
      tone: 'warning',
      title: `Attendance isn't complete for ${unfinished.length} classes`,
      detail: classList(unfinished.map((status) => status.schoolClass)),
      actionLabel: 'Mark now',
      href: ROUTES.admin.studentAttendance,
    });
  } else {
    for (const status of unfinished) {
      const label = classLabel(status.schoolClass);
      const teacherId = status.schoolClass.classTeacherId;
      const classTeacher = teacherId ? scope.teacherById.get(teacherId) : undefined;
      attention.push({
        id: `attendance-${status.schoolClass.id}`,
        tone: 'warning',
        title: status.markedToday === 0 ? `Attendance for ${label} isn't marked yet` : `Attendance for ${label} is incomplete`,
        detail: `${status.markedToday} of ${pluralize(status.enrolled ?? 0, 'student')}${classTeacher ? ` · class teacher ${teacherLabel(classTeacher)}` : ''}`,
        actionLabel: status.markedToday === 0 ? 'Mark now' : 'Finish',
        href: `${ROUTES.admin.studentAttendance}?classId=${encodeURIComponent(status.schoolClass.id)}`,
      });
    }
  }

  if (finished.length > MAX_SEPARATE_CLASS_ITEMS) {
    done.push({ id: 'attendance-students-done', title: `Attendance marked for ${finished.length} classes`, detail: 'Every student is marked today' });
  } else {
    for (const status of finished) {
      done.push({
        id: `attendance-${status.schoolClass.id}-done`,
        title: `Attendance marked for ${classLabel(status.schoolClass)}`,
        detail: `${status.enrolled} of ${pluralize(status.enrolled ?? 0, 'student')}`,
      });
    }
  }
}

function teacherAttendanceItems(source: OverviewSource, attention: AttentionItem[], done: DoneItem[]) {
  const teachers = source.activeTeachers;
  const marked = source.teachersMarkedToday;
  if (!source.isSchoolDay || !teachers || marked === null) return;
  if (marked >= teachers) {
    done.push({ id: 'attendance-teachers-done', title: 'Teacher attendance marked', detail: `${teachers} of ${pluralize(teachers, 'teacher')}` });
    return;
  }
  attention.push({
    id: 'attendance-teachers',
    tone: 'warning',
    title: marked === 0 ? "Teacher attendance isn't marked yet" : 'Teacher attendance is incomplete',
    detail: `${marked} of ${pluralize(teachers, 'teacher')}`,
    actionLabel: marked === 0 ? 'Mark now' : 'Finish',
    href: ROUTES.admin.teacherAttendance,
  });
}

/** HOW MANY MARKS AN EXAM SHOULD HAVE: ONE PER ENROLLED STUDENT PER PAPER. NULL IF ANY CLASS SIZE IS UNKNOWN. */
function expectedMarks(status: ExamStatus, source: OverviewSource): number | null {
  if (!status.papers) return null;
  const enrolledByClass = new Map(source.classStatuses.map((classStatus) => [classStatus.schoolClass.id, classStatus.enrolled]));
  let total = 0;
  for (const paper of status.papers) {
    const enrolled = enrolledByClass.get(paper.classId);
    if (enrolled === null || enrolled === undefined) return null;
    total += enrolled;
  }
  return total;
}

function examItems(scope: OverviewScope, source: OverviewSource, attention: AttentionItem[], done: DoneItem[]) {
  const soon = shiftIsoDate(scope.today, EXAM_SOON_DAYS);
  for (const status of source.examStatuses ?? []) {
    const { exam, papers } = status;
    const examHref = `${ROUTES.admin.exams}/${encodeURIComponent(exam.id)}`;

    if (papers && papers.length === 0 && exam.startDate && exam.startDate > scope.today && exam.startDate <= soon) {
      attention.push({
        id: `exam-papers-${exam.id}`,
        tone: 'warning',
        title: `${exam.name} has no papers yet`,
        detail: `Starts ${formatDate(exam.startDate)}`,
        actionLabel: 'Add papers',
        href: examHref,
      });
      continue;
    }

    const hasStarted = exam.startDate !== null && exam.startDate <= scope.today;
    const expected = expectedMarks(status, source);
    if (!hasStarted || !papers || papers.length === 0 || expected === null || expected === 0 || status.resultCount === null) continue;

    if (status.resultCount >= expected) {
      done.push({ id: `exam-marks-${exam.id}-done`, title: `${exam.name} marks are complete`, detail: `${expected} of ${expected} entered` });
      continue;
    }
    const hasEnded = exam.endDate !== null && exam.endDate < scope.today;
    attention.push({
      id: `exam-marks-${exam.id}`,
      tone: hasEnded ? 'warning' : 'info',
      title: hasEnded ? `Marks are missing for ${exam.name}` : `Marks are coming in for ${exam.name}`,
      detail: `${status.resultCount} of ${expected} entered`,
      actionLabel: 'Enter marks',
      href: ROUTES.admin.results,
    });
  }
}

/** SET-UP GAPS IN THE YEAR'S CLASSES: NO STUDENTS, NO TIMETABLE, NO CLASS TEACHER. */
function classSetupItems(source: OverviewSource, attention: AttentionItem[]) {
  const statuses = sortStatuses(source.classStatuses);
  const gaps = [
    {
      key: 'students',
      classes: statuses.filter((status) => status.enrolled === 0).map((status) => status.schoolClass),
      one: (label: string) => `${label} has no students yet`,
      many: (count: number) => `${count} classes have no students yet`,
      detail: 'Enroll students so they appear in registers and results',
      actionLabel: 'Enroll',
      href: ROUTES.admin.enrollments,
    },
    {
      key: 'timetable',
      classes: statuses.filter((status) => status.periods === 0).map((status) => status.schoolClass),
      one: (label: string) => `${label} has no timetable`,
      many: (count: number) => `${count} classes have no timetable`,
      detail: 'Students and teachers see an empty week',
      actionLabel: 'Build timetable',
      href: ROUTES.admin.timetable,
    },
    {
      key: 'class-teacher',
      classes: statuses.filter((status) => !status.schoolClass.classTeacherId).map((status) => status.schoolClass),
      one: (label: string) => `${label} has no class teacher`,
      many: (count: number) => `${count} classes have no class teacher`,
      detail: 'The class teacher takes the daily register',
      actionLabel: 'Assign',
      href: ROUTES.admin.classes,
    },
  ];

  for (const gap of gaps) {
    if (gap.classes.length === 0) continue;
    const isSingle = gap.classes.length === 1;
    attention.push({
      id: `class-${gap.key}`,
      tone: 'info',
      title: isSingle ? gap.one(classLabel(gap.classes[0])) : gap.many(gap.classes.length),
      detail: isSingle ? gap.detail : classList(gap.classes),
      actionLabel: gap.actionLabel,
      href: gap.href,
    });
  }
}

function draftItems(scope: OverviewScope, source: OverviewSource, attention: AttentionItem[]) {
  const drafts = source.draftNotices ?? [];
  if (drafts.length > MAX_SEPARATE_DRAFTS) {
    attention.push({
      id: 'drafts',
      tone: 'info',
      title: `${drafts.length} draft notices`,
      detail: drafts.slice(0, MAX_SEPARATE_DRAFTS).map((notice) => notice.title).join(', ') + ` and ${drafts.length - MAX_SEPARATE_DRAFTS} more`,
      actionLabel: 'Review',
      href: ROUTES.admin.notices,
    });
    return;
  }
  for (const notice of drafts) {
    attention.push({
      id: `draft-${notice.id}`,
      tone: 'info',
      title: `Draft notice: ${notice.title}`,
      detail: `${audienceSummary(notice.audiences, scope.classById)} · not published yet`,
      actionLabel: 'Review',
      href: noticeDetailPath(notice.id),
    });
  }
}

function buildAttention(scope: OverviewScope, source: OverviewSource): { attention: AttentionItem[]; done: DoneItem[] } {
  const year = scope.year;
  if (!year) {
    return {
      attention: [
        {
          id: 'no-year',
          tone: 'warning',
          title: 'No current academic year',
          detail: 'Classes, attendance and exams all belong to one',
          actionLabel: 'Set one up',
          href: ROUTES.admin.academicYears,
        },
      ],
      done: [],
    };
  }

  const attention: AttentionItem[] = [];
  const done: DoneItem[] = [];

  if (year.endDate < scope.today) {
    attention.push({
      id: 'year-ended',
      tone: 'warning',
      title: `${year.name} ended on ${formatDate(year.endDate)}`,
      detail: 'Create the next year and mark it current',
      actionLabel: 'Academic years',
      href: ROUTES.admin.academicYears,
    });
  }
  if (scope.classes.length === 0) {
    attention.push({
      id: 'no-classes',
      tone: 'warning',
      title: `No classes in ${year.name} yet`,
      detail: 'Add the classes and sections for this year',
      actionLabel: 'Add classes',
      href: ROUTES.admin.classes,
    });
  }

  studentAttendanceItems(scope, source, attention, done);
  teacherAttendanceItems(source, attention, done);
  examItems(scope, source, attention, done);
  classSetupItems(source, attention);
  draftItems(scope, source, attention);

  // TODAY'S WORK AND OVERDUE MARKS FIRST, THEN SET-UP AND DRAFTS; ORDER WITHIN EACH TONE IS KEPT.
  const warnings = attention.filter((item) => item.tone === 'warning');
  const infos = attention.filter((item) => item.tone === 'info');
  return { attention: [...warnings, ...infos], done };
}

/** EXAMS STILL AHEAD (OR UNDER WAY) AND THE YEAR'S LAST DAY, SOONEST FIRST. */
function buildUpcoming(scope: OverviewScope, source: OverviewSource): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const status of source.examStatuses ?? []) {
    const { exam, papers } = status;
    if (!exam.startDate || (exam.endDate ?? exam.startDate) < scope.today) continue;
    const isUnderWay = exam.startDate <= scope.today;
    const range = exam.endDate && exam.endDate !== exam.startDate ? `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}` : formatDate(exam.startDate);
    const paperCount = papers ? pluralize(papers.length, 'paper') : null;
    items.push({
      id: `exam-${exam.id}`,
      date: isUnderWay ? scope.today : exam.startDate,
      title: exam.name,
      detail: paperCount ? `${range} · ${paperCount}` : range,
      tag: isUnderWay ? { label: 'Under way', tone: 'info' } : papers && papers.length === 0 ? { label: 'No papers yet', tone: 'warning' } : null,
      href: `${ROUTES.admin.exams}/${encodeURIComponent(exam.id)}`,
    });
  }
  if (scope.year && scope.year.endDate >= scope.today) {
    items.push({
      id: 'year-end',
      date: scope.year.endDate,
      title: `${scope.year.name} ends`,
      detail: 'Last day of the academic year',
      tag: null,
      href: ROUTES.admin.academicYears,
    });
  }
  return items.sort((first, second) => first.date.localeCompare(second.date)).slice(0, MAX_UPCOMING_ITEMS);
}

function average(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** CLASS AVERAGE, PASSES, PER-SUBJECT AVERAGES AND THE TOP STUDENTS OF ONE EXAM. */
export function buildSnapshot(source: SnapshotSource, scope: Pick<OverviewScope, 'classById' | 'subjectById'>): ExamSnapshot | null {
  const paperById = new Map(source.papers.map((paper) => [paper.id, paper]));
  const scored = source.results.flatMap((result) => {
    const paper = paperById.get(result.examSubjectId);
    if (!paper || Number(paper.maxMarks) <= 0) return [];
    const marks = Number(result.marksObtained);
    const passMarks = paper.passMarks === null ? null : Number(paper.passMarks);
    return [{ result, paper, percent: (marks / Number(paper.maxMarks)) * 100, isPassed: passMarks === null || marks >= passMarks }];
  });
  if (scored.length === 0) return null;

  const bySubject = new Map<string, typeof scored>();
  const byStudent = new Map<string, typeof scored>();
  for (const entry of scored) {
    bySubject.set(entry.paper.subjectId, [...(bySubject.get(entry.paper.subjectId) ?? []), entry]);
    byStudent.set(entry.result.studentId, [...(byStudent.get(entry.result.studentId) ?? []), entry]);
  }

  const subjects = [...bySubject.entries()]
    .map(([subjectId, entries]) => ({
      subjectId,
      label: subjectLabel(scope.subjectById.get(subjectId)),
      averagePercent: average(entries.map((entry) => entry.percent)),
      belowPassCount: entries.filter((entry) => !entry.isPassed).length,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));

  const topStudents = [...byStudent.entries()]
    .map(([studentId, entries]) => ({
      studentId,
      name: source.studentNames.get(studentId) ?? 'Student',
      classLabel: classLabel(scope.classById.get(entries[0].result.classId)),
      averagePercent: average(entries.map((entry) => entry.percent)),
    }))
    .sort((first, second) => second.averagePercent - first.averagePercent)
    .slice(0, TOP_STUDENT_COUNT);

  const classIds = new Set(scored.map((entry) => entry.result.classId));
  return {
    examId: source.exam.id,
    examName: source.exam.name,
    classScope: classIds.size === 1 ? classLabel(scope.classById.get([...classIds][0])) : null,
    averagePercent: average(scored.map((entry) => entry.percent)),
    resultCount: scored.length,
    passedCount: scored.filter((entry) => entry.isPassed).length,
    subjects,
    topStudents,
  };
}

/** THE STUDENT IDS WITH THE BEST AVERAGE IN AN EXAM, SO ONLY THEIR NAMES NEED LOADING. */
export function topStudentIds(source: Omit<SnapshotSource, 'studentNames'>): string[] {
  const snapshot = buildSnapshot({ ...source, studentNames: new Map() }, { classById: new Map(), subjectById: new Map() });
  return snapshot?.topStudents.map((student) => student.studentId) ?? [];
}

export function buildTodayOverview(scope: OverviewScope, source: OverviewSource): TodayOverview {
  const { attention, done } = buildAttention(scope, source);
  return {
    attention,
    done,
    upcoming: buildUpcoming(scope, source),
    snapshot: source.snapshot ? buildSnapshot(source.snapshot, scope) : null,
    counts: {
      students: source.activeStudents,
      teachers: source.activeTeachers,
      classes: scope.year ? scope.classes.length : null,
      subjects: scope.subjects.length,
      exams: source.examStatuses ? source.examStatuses.length : null,
      liveNotices: source.liveNotices,
    },
  };
}
