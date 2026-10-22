import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { LATEST_NOTICE_LIMIT, UPCOMING_PAPER_LIMIT } from '@/constants/teacher-overview';
import { apiRequest, countRecords, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import { isoWeekday } from '@/helpers/format';
import type { PaginatedList } from '@/types/api';
import type { ApiResult } from '@/types/api-client';
import type { Exam } from '@/types/exams';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Notice } from '@/types/notices';
import type { TeacherAssignment } from '@/types/teacher-assignments';
import type { Teacher } from '@/types/teachers';
import type { ClassAttendanceToday, TeacherOverview, TeacherOverviewScope, UpcomingPaper } from '@/types/teacher-overview';
import type { TimetableEntry } from '@/types/timetable';

/** TODAY'S ATTENDANCE COUNT PER CLASS: ONE limit=1 COUNT PER CLASS. A FAILED COUNT IS NULL, NOT AN ERROR FOR THE PAGE. */
async function loadAttendanceToday(classIds: readonly string[], today: string): Promise<ClassAttendanceToday[]> {
  const counts = await Promise.all(classIds.map((classId) => countRecords(API_PATHS.studentAttendance, { classId, date: today })));
  return classIds.map((classId, index) => {
    const count = counts[index];
    return { classId, markedCount: count?.success ? count.data : null };
  });
}

/** THE TEACHER'S PAPERS (CLASS AND SUBJECT THEY TEACH) DATED TODAY OR LATER, SOONEST FIRST. */
function upcomingPapersOf(papers: ExamSubject[], exams: Exam[], assignments: TeacherAssignment[], today: string): UpcomingPaper[] {
  const taught = new Set(assignments.map((assignment) => `${assignment.classId}|${assignment.subjectId}`));
  const examById = new Map(exams.map((exam) => [exam.id, exam]));
  return papers
    .filter((paper) => paper.examDate !== null && paper.examDate >= today && taught.has(`${paper.classId}|${paper.subjectId}`))
    .sort((first, second) => (first.examDate ?? '').localeCompare(second.examDate ?? ''))
    .slice(0, UPCOMING_PAPER_LIMIT)
    .map((paper) => ({ paper, exam: examById.get(paper.examId) ?? null }));
}

function noRows<T>(): Promise<ApiResult<T[]>> {
  return Promise.resolve({ success: true, message: 'Operation successful', data: [] });
}

/**
 * THE TEACHER HOME PAGE IN ONE ROUND OF PARALLEL REQUESTS: THEIR RECORD, THEIR
 * ASSIGNMENTS, TODAY'S PERIODS, THE PAPERS AND EXAMS OF THEIR CLASSES (BOUNDED:
 * RLS LIMITS PAPERS TO CLASSES THEY TEACH; EXAMS TO THE CURRENT YEAR), THE LATEST
 * NOTICES, AND ONE ATTENDANCE COUNT PER CURRENT CLASS. NO STUDENT LISTS ARE DOWNLOADED.
 */
export async function loadTeacherOverview(scope: TeacherOverviewScope): Promise<ApiResult<TeacherOverview>> {
  try {
    const yearId = scope.currentAcademicYearId;
    const [teacher, assignments, periods, papers, exams, notices, attendanceToday] = await Promise.all([
      apiRequest<Teacher>(`${API_PATHS.teachers}/${encodeURIComponent(scope.teacherId)}`),
      fetchAllPages<TeacherAssignment>(API_PATHS.teacherAssignments),
      yearId
        ? fetchAllPages<TimetableEntry>(API_PATHS.timetableEntries, { teacherId: scope.teacherId, academicYearId: yearId, dayOfWeek: isoWeekday(scope.today) })
        : noRows<TimetableEntry>(),
      yearId ? fetchAllPages<ExamSubject>(API_PATHS.examSubjects) : noRows<ExamSubject>(),
      yearId ? fetchAllPages<Exam>(API_PATHS.exams, { academicYearId: yearId }) : noRows<Exam>(),
      apiRequest<PaginatedList<Notice>>(API_PATHS.notices, { query: { page: 1, limit: LATEST_NOTICE_LIMIT } }),
      loadAttendanceToday(scope.currentClassIds, scope.today),
    ]);

    if (!teacher.success) return teacher;
    if (!assignments.success) return assignments;
    if (!periods.success) return periods;
    if (!papers.success) return papers;
    if (!exams.success) return exams;
    if (!notices.success) return notices;

    const currentPapers = papers.data.filter((paper) => scope.currentClassIds.includes(paper.classId));
    return {
      success: true,
      message: 'Operation successful',
      data: {
        teacher: teacher.data,
        assignments: assignments.data,
        periodsToday: periods.data,
        attendanceToday,
        upcomingPapers: upcomingPapersOf(currentPapers, exams.data, assignments.data, scope.today),
        notices: notices.data.items,
      },
    };
  } catch {
    return networkFailure();
  }
}
