import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { STUDENT_LATEST_NOTICE_LIMIT } from '@/constants/student-overview';
import { apiRequest, fetchAllPages } from '@/functions/api-client';
import { loadAttendanceStatusCounts } from '@/functions/attendance-status-counts';
import { loadReportCard } from '@/functions/student-results';
import { networkFailure } from '@/helpers/api-client';
import { isoWeekday } from '@/helpers/format';
import type { PaginatedList } from '@/types/api';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { Exam } from '@/types/exams';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Notice } from '@/types/notices';
import type { StudentOverview, StudentOverviewScope } from '@/types/student-overview';
import type { Student } from '@/types/students';
import type { TimetableEntry } from '@/types/timetable';

/** THE MOST RECENT EXAM OF THE CLASS THAT HAS STARTED (IT HAS PAPERS FOR THE CLASS AND A START DATE NOT AFTER TODAY). */
function latestStartedExam(exams: Exam[], papers: ExamSubject[], today: string): Exam | null {
  const examIdsWithPapers = new Set(papers.map((paper) => paper.examId));
  return (
    exams
      .filter((exam) => examIdsWithPapers.has(exam.id) && exam.startDate !== null && exam.startDate <= today)
      .sort((first, second) => (second.startDate ?? '').localeCompare(first.startDate ?? ''))[0] ?? null
  );
}

/**
 * THE STUDENT HOME PAGE IN TWO SHORT ROUNDS. FIRST: THEIR RECORD, THIS YEAR'S
 * ENROLLMENT, THE YEAR'S ATTENDANCE COUNTS (FOUR limit=1 COUNTS) AND THE LATEST
 * NOTICES. THEN, FOR THEIR CLASS: TODAY'S PERIODS, THE YEAR'S EXAMS AND PAPERS
 * (BOTH SHORT LISTS), AND ONE REPORT CARD. NO LONG LISTS ARE DOWNLOADED.
 */
export async function loadStudentOverview(scope: StudentOverviewScope): Promise<ApiResult<StudentOverview>> {
  try {
    const year = scope.currentAcademicYear;
    const attendanceTo = year && year.endDate < scope.today ? year.endDate : scope.today;
    const [student, enrollments, attendance, notices] = await Promise.all([
      apiRequest<Student>(`${API_PATHS.students}/${encodeURIComponent(scope.studentId)}`),
      year ? fetchAllPages<Enrollment>(API_PATHS.enrollments, { studentId: scope.studentId, academicYearId: year.id }) : null,
      year && year.startDate <= scope.today ? loadAttendanceStatusCounts(API_PATHS.studentAttendance, { studentId: scope.studentId }, year.startDate, attendanceTo) : null,
      apiRequest<PaginatedList<Notice>>(API_PATHS.notices, { query: { page: 1, limit: STUDENT_LATEST_NOTICE_LIMIT } }),
    ]);

    if (!student.success) return student;
    if (enrollments && !enrollments.success) return enrollments;
    if (!notices.success) return notices;

    const enrollment = enrollments?.data[0] ?? null;
    const overview: StudentOverview = {
      student: student.data,
      enrollment,
      periodsToday: [],
      attendance: attendance?.success ? attendance.data : null,
      latestReportCard: null,
      notices: notices.data.items,
    };
    if (!year || !enrollment) return { success: true, message: 'Operation successful', data: overview };

    const [periods, exams, papers] = await Promise.all([
      fetchAllPages<TimetableEntry>(API_PATHS.timetableEntries, { classId: enrollment.classId, academicYearId: year.id, dayOfWeek: isoWeekday(scope.today) }),
      fetchAllPages<Exam>(API_PATHS.exams, { academicYearId: year.id }),
      fetchAllPages<ExamSubject>(API_PATHS.examSubjects, { classId: enrollment.classId }),
    ]);
    if (!periods.success) return periods;
    if (!exams.success) return exams;
    if (!papers.success) return papers;

    const exam = latestStartedExam(exams.data, papers.data, scope.today);
    const reportCard = exam ? await loadReportCard(scope.studentId, exam.id) : null;
    if (reportCard && !reportCard.success) return reportCard;

    return {
      success: true,
      message: 'Operation successful',
      data: { ...overview, periodsToday: periods.data, latestReportCard: reportCard?.data ?? null },
    };
  } catch {
    return networkFailure();
  }
}
