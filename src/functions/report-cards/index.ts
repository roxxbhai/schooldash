import 'server-only';
import { RESULT_COLUMNS, RESULT_ERRORS } from '@/constants/results';
import { findTeacherIdByUserId, requireStudentOwnership, teachesClass } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { findEnrollmentForYear } from '@/functions/enrollments';
import { papersForClass } from '@/functions/exam-subjects';
import { findExam } from '@/functions/exams';
import { findStudent } from '@/functions/students';
import { assignedSubjectIds } from '@/functions/teacher-assignments';
import { forbidden, notFound } from '@/helpers/api-error';
import { many } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { fromHundredths, toHundredths } from '@/helpers/school-validation';
import type { AppUser } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { ReportCard, ReportCardSubject } from '@/types/report-cards';
import type { Result } from '@/types/results';
import type { DbClient } from '@/types/supabase';

/**
 * REPORT-CARD DATA FOR ONE STUDENT AND ONE EXAM (NO RENDERING, NO PDF), BUILT
 * FROM ROWS READ WITH THE CALLER'S CLIENT, SO RLS APPLIES TO EVERY PIECE.
 *
 * WHO MAY READ: ADMINS ANY STUDENT; STUDENTS ONLY THEMSELVES (403 OTHERWISE);
 * TEACHERS STUDENTS IN A CLASS THEY TEACH THAT YEAR, LIMITED TO THE SUBJECTS
 * THEY ARE ASSIGNED (`scope: 'assignedSubjects'`) AND WITHOUT TOTALS, BECAUSE A
 * PARTIAL CARD MUST NEVER LOOK COMPLETE.
 *
 * CALCULATED: PER SUBJECT maxMarks, passMarks (AS CONFIGURED) AND marksObtained,
 * OR NULL WITH STATUS 'notEntered' — A MISSING MARK IS NEVER ZERO; A RECORDED 0
 * IS A REAL MARK. TOTALS ONLY WHEN THE CARD IS COMPLETE, EXACT IN HUNDREDTHS.
 * NOT CALCULATED: PERCENTAGE, GRADE OR PASS/FAIL (NO RULES ARE DEFINED), AND NO
 * PUBLICATION STATE (THE SCHEMA HAS NO PUBLICATION FLAG).
 */

function sumMarks(values: number[]): number {
  return fromHundredths(values.reduce((total, value) => total + toHundredths(value), 0));
}

/** THE SUBJECTS A TEACHER MAY SEE ON THIS CARD; 403 IF THEY DON'T TEACH THE CLASS. */
async function teacherVisibleSubjects(client: DbClient, viewer: AppUser, classId: string): Promise<Set<string>> {
  if (!unwrapResult(await teachesClass(client, viewer, { classId }))) {
    throw forbidden('You can only view report cards for classes you teach.');
  }
  const teacherId = unwrapResult(await findTeacherIdByUserId(client, viewer.id));
  return teacherId ? unwrapResult(await assignedSubjectIds(client, teacherId, classId)) : new Set<string>();
}

export async function buildReportCard(client: DbClient, studentId: string, examId: string, viewer: AppUser): Promise<FunctionResult<ReportCard>> {
  try {
    if (viewer.role === 'STUDENT') unwrapResult(await requireStudentOwnership(client, studentId));

    const student = unwrapResult(await findStudent(client, studentId)); // RLS: ADMIN / OWN / TAUGHT → ELSE 404
    const exam = unwrapResult(await findExam(client, examId));
    const enrollment = unwrapResult(await findEnrollmentForYear(client, student.id, exam.academicYearId));
    if (!enrollment) throw notFound("The student was not enrolled in a class in that exam's academic year.");

    let visibleSubjectIds: Set<string> | null = null; // NULL = EVERY SUBJECT
    switch (viewer.role) {
      case 'ADMIN':
      case 'STUDENT':
        break;
      case 'TEACHER':
        visibleSubjectIds = await teacherVisibleSubjects(client, viewer, enrollment.classId);
        break;
      default:
        throw forbidden();
    }

    const schoolClass = unwrapResult(await findClass(client, enrollment.classId));
    const papers = unwrapResult(await papersForClass(client, exam.id, enrollment.classId)).filter(
      (paper) => visibleSubjectIds === null || visibleSubjectIds.has(paper.subjectId),
    );
    const marks =
      papers.length > 0
        ? await many<Result>(
            'results.forStudent',
            client.from('results').select(RESULT_COLUMNS).eq('studentId', student.id).in('examSubjectId', papers.map((paper) => paper.id)),
            RESULT_ERRORS,
          )
        : [];
    const markByPaper = new Map(marks.map((result) => [result.examSubjectId, result]));

    const subjects: ReportCardSubject[] = papers
      .map((paper) => {
        const result = markByPaper.get(paper.id);
        return {
          examSubjectId: paper.id,
          subjectId: paper.subjectId,
          subjectCode: paper.subject?.code ?? null,
          subjectName: paper.subject?.name ?? null,
          examDate: paper.examDate,
          maxMarks: paper.maxMarks,
          passMarks: paper.passMarks,
          marksObtained: result ? result.marksObtained : null,
          remarks: result?.remarks ?? null,
          status: result ? ('entered' as const) : ('notEntered' as const),
        };
      })
      .sort((a, b) => (a.subjectCode ?? '').localeCompare(b.subjectCode ?? '') || a.examSubjectId.localeCompare(b.examSubjectId));

    const subjectsWithMarks = subjects.filter((subject) => subject.status === 'entered');
    const isComplete = visibleSubjectIds === null && subjects.length > 0 && subjectsWithMarks.length === subjects.length;

    return functionSuccess<ReportCard>({
      student: { id: student.id, admissionNumber: student.admissionNumber, fullName: student.user?.fullName ?? null },
      exam: { id: exam.id, name: exam.name, academicYearId: exam.academicYearId, startDate: exam.startDate, endDate: exam.endDate },
      class: { id: schoolClass.id, name: schoolClass.name, section: schoolClass.section },
      scope: visibleSubjectIds === null ? 'allSubjects' : 'assignedSubjects',
      subjects,
      summary: {
        subjectsConfigured: subjects.length,
        subjectsWithMarks: subjectsWithMarks.length,
        complete: isComplete,
        totalMarksObtained: isComplete ? sumMarks(subjectsWithMarks.map((subject) => subject.marksObtained ?? 0)) : null,
        totalMaxMarks: isComplete ? sumMarks(subjects.map((subject) => subject.maxMarks)) : null,
      },
    });
  } catch (error) {
    return functionFailure(error, 'reportCards.build');
  }
}
