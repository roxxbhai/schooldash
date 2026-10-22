import 'client-only';
import { OVERVIEW_CONCURRENCY, SUNDAY } from '@/constants/admin-overview';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, countRecords, fetchAllPages } from '@/functions/api-client';
import { buildTodayOverview, mapInBatches, topStudentIds } from '@/helpers/admin-overview';
import { networkFailure } from '@/helpers/api-client';
import type { AdminNotice } from '@/types/admin-notices';
import type { ClassStatus, ExamStatus, OverviewScope, SnapshotSource, TodayOverview } from '@/types/admin-overview';
import type { ApiResult, QueryParams } from '@/types/api-client';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Exam } from '@/types/exams';
import type { Result } from '@/types/results';
import type { Student } from '@/types/students';

/** A COUNT, OR NULL IF THAT ONE REQUEST FAILED. */
async function count(path: string, query: QueryParams): Promise<number | null> {
  const result = await countRecords(path, query);
  return result.success ? result.data : null;
}

/** EVERY ROW, OR NULL IF ANY PAGE FAILED. */
async function listAll<T>(path: string, query: QueryParams): Promise<T[] | null> {
  const result = await fetchAllPages<T>(path, query);
  return result.success ? result.data : null;
}

/** THE MOST RECENT EXAM THAT HAS STARTED AND HAS ANY MARKS. */
function latestMarkedExam(statuses: readonly ExamStatus[], today: string): ExamStatus | null {
  return (
    statuses
      .filter((status) => status.exam.startDate !== null && status.exam.startDate <= today && (status.resultCount ?? 0) > 0 && (status.papers?.length ?? 0) > 0)
      .sort((first, second) => (second.exam.startDate ?? '').localeCompare(first.exam.startDate ?? ''))[0] ?? null
  );
}

/** ALL MARKS OF ONE EXAM, A CLASS AT A TIME (EACH CLASS IS A BOUNDED LIST), PLUS THE TOP STUDENTS' NAMES. */
async function loadSnapshot(status: ExamStatus): Promise<SnapshotSource | null> {
  const papers = status.papers ?? [];
  const classIds = [...new Set(papers.map((paper) => paper.classId))];
  const perClass = await mapInBatches(classIds, OVERVIEW_CONCURRENCY, function loadClassResults(classId) {
    return listAll<Result>(API_PATHS.results, { examId: status.exam.id, classId });
  });
  if (perClass.some((results) => results === null)) return null;
  const results = perClass.flatMap((list) => list ?? []);

  const topIds = topStudentIds({ exam: status.exam, papers, results });
  const students = await Promise.all(topIds.map((id) => apiRequest<Student>(`${API_PATHS.students}/${encodeURIComponent(id)}`)));
  const studentNames = new Map(students.flatMap((student) => (student.success ? [[student.data.id, student.data.user.fullName] as const] : [])));
  return { exam: status.exam, papers, results, studentNames };
}

/**
 * THE "TODAY" PAGE: WHAT NEEDS AN ADMIN NOW, WHAT'S DONE, WHAT'S COMING AND HOW
 * THE LATEST EXAM WENT. ONLY SMALL READS (COUNTS, BOUNDED LISTS), A FEW AT A
 * TIME. ONE FAILED REQUEST LEAVES ITS FIGURE OUT WITHOUT HIDING THE REST.
 */
export async function loadTodayOverview(scope: OverviewScope): Promise<ApiResult<TodayOverview>> {
  try {
    const yearId = scope.year?.id ?? null;
    const isSchoolDay = scope.year !== null && scope.today >= scope.year.startDate && scope.today <= scope.year.endDate && scope.dayOfWeek !== SUNDAY;

    const [activeStudents, activeTeachers, liveNotices, draftNotices, teachersMarkedToday, exams] = await Promise.all([
      count(API_PATHS.students, { isActive: true }),
      count(API_PATHS.teachers, { isActive: true }),
      count(API_PATHS.notices, { status: 'published' }),
      listAll<AdminNotice>(API_PATHS.notices, { status: 'draft' }),
      isSchoolDay ? count(API_PATHS.teacherAttendance, { date: scope.today }) : Promise.resolve(null),
      yearId ? listAll<Exam>(API_PATHS.exams, { academicYearId: yearId }) : Promise.resolve([]),
    ]);

    const [classStatuses, examStatuses] = await Promise.all([
      mapInBatches(scope.classes, OVERVIEW_CONCURRENCY, async function loadClassStatus(schoolClass): Promise<ClassStatus> {
        const [enrolled, markedToday, periods] = await Promise.all([
          count(API_PATHS.enrollments, { classId: schoolClass.id }),
          isSchoolDay ? count(API_PATHS.studentAttendance, { classId: schoolClass.id, date: scope.today }) : Promise.resolve(null),
          count(API_PATHS.timetableEntries, { classId: schoolClass.id }),
        ]);
        return { schoolClass, enrolled, markedToday, periods };
      }),
      exams
        ? mapInBatches(exams, OVERVIEW_CONCURRENCY, async function loadExamStatus(exam): Promise<ExamStatus> {
            const [papers, resultCount] = await Promise.all([
              listAll<ExamSubject>(API_PATHS.examSubjects, { examId: exam.id }),
              count(API_PATHS.results, { examId: exam.id }),
            ]);
            return { exam, papers, resultCount };
          })
        : Promise.resolve(null),
    ]);

    const markedExam = examStatuses ? latestMarkedExam(examStatuses, scope.today) : null;
    const snapshot = markedExam ? await loadSnapshot(markedExam) : null;

    const overview = buildTodayOverview(scope, {
      activeStudents,
      activeTeachers,
      liveNotices,
      draftNotices,
      teachersMarkedToday,
      isSchoolDay,
      classStatuses,
      examStatuses,
      snapshot,
    });
    return { success: true, message: 'Operation successful', data: overview };
  } catch {
    return networkFailure();
  }
}
