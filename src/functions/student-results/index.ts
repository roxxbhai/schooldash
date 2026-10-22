import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { ApiResult } from '@/types/api-client';
import type { Enrollment } from '@/types/enrollments';
import type { Exam } from '@/types/exams';
import type { ExamSubject } from '@/types/exam-subjects';
import type { ReportCard } from '@/types/report-cards';

/** EVERY YEAR THE STUDENT WAS ENROLLED (ONE ROW PER YEAR). */
export async function loadStudentEnrollments(studentId: string): Promise<ApiResult<Enrollment[]>> {
  try {
    return await fetchAllPages<Enrollment>(API_PATHS.enrollments, { studentId });
  } catch {
    return networkFailure();
  }
}

/** THE YEAR'S EXAMS THAT HAVE AT LEAST ONE PAPER FOR THE STUDENT'S CLASS, NEWEST FIRST (BOTH LISTS ARE SHORT). */
export async function loadStudentExams(classId: string, academicYearId: string): Promise<ApiResult<Exam[]>> {
  try {
    const [exams, papers] = await Promise.all([
      fetchAllPages<Exam>(API_PATHS.exams, { academicYearId }),
      fetchAllPages<ExamSubject>(API_PATHS.examSubjects, { classId }),
    ]);
    if (!exams.success) return exams;
    if (!papers.success) return papers;
    const examIdsWithPapers = new Set(papers.data.map((paper) => paper.examId));
    const withPapers = exams.data
      .filter((exam) => examIdsWithPapers.has(exam.id))
      .sort((first, second) => (second.startDate ?? '').localeCompare(first.startDate ?? ''));
    return { success: true, message: 'Operation successful', data: withPapers };
  } catch {
    return networkFailure();
  }
}

/** THE STUDENT'S OWN REPORT CARD FOR ONE EXAM (ANOTHER STUDENT'S IS A 403). */
export async function loadReportCard(studentId: string, examId: string, signal?: AbortSignal): Promise<ApiResult<ReportCard>> {
  try {
    return await apiRequest<ReportCard>(`${API_PATHS.students}/${encodeURIComponent(studentId)}/report-cards/${encodeURIComponent(examId)}`, { signal });
  } catch {
    return networkFailure();
  }
}
