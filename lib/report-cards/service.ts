import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forbidden, notFound } from "@/lib/api/errors";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { findClass } from "@/lib/classes/repository";
import { findEnrollmentForYear } from "@/lib/enrollments/repository";
import { papersForClass } from "@/lib/exam-subjects/repository";
import { findExam } from "@/lib/exams/repository";
import { resultsForStudent } from "@/lib/results/repository";
import { fromHundredths, toHundredths } from "@/lib/school/validation";
import { findStudent } from "@/lib/students/repository";
import type { Database } from "@/lib/supabase/database.types";
import { assignedSubjectIds } from "@/lib/teacher-assignments/repository";

/**
 * Report-card DATA for one student and one exam (no rendering, no PDF).
 *
 * Built from validated database rows read with the caller's client, so RLS
 * applies to every piece.
 *
 * Who may read:
 *   - Admins: any student.
 *   - Students: only themselves (403 otherwise).
 *   - Teachers: students in a class they teach that year; they see ONLY the
 *     subjects they are assigned to in that class (`scope: "assignedSubjects"`),
 *     and no totals, because a partial card must never look complete.
 *
 * What is calculated — and what deliberately is not:
 *   - Per subject: maxMarks, passMarks (as configured) and marksObtained,
 *     or null with status "notEntered" when no mark exists. A missing mark is
 *     NEVER treated as zero; a recorded 0 is a real mark.
 *   - Totals (sum of marks, sum of maxMarks over every configured subject)
 *     only when the card is complete: every configured subject has a mark and
 *     the caller can see all subjects. Computed exactly in hundredths.
 *   - No percentage, grade or pass/fail: no rounding rule, grade boundaries or
 *     pass rule is defined. passMarks is returned as configured so a client
 *     can apply a rule once one is agreed.
 *   - No publication state: the schema has no publication flag.
 */

type Client = SupabaseClient<Database>;

export interface ReportCardSubject {
  examSubjectId: string;
  subjectId: string;
  subjectCode: string | null;
  subjectName: string | null;
  examDate: string | null;
  maxMarks: number;
  passMarks: number | null;
  marksObtained: number | null;
  remarks: string | null;
  status: "entered" | "notEntered";
}

export interface ReportCard {
  student: { id: string; admissionNumber: string; fullName: string | null };
  exam: { id: string; name: string; academicYearId: string; startDate: string | null; endDate: string | null };
  class: { id: string; name: string; section: string };
  scope: "allSubjects" | "assignedSubjects";
  subjects: ReportCardSubject[];
  summary: {
    subjectsConfigured: number;
    subjectsWithMarks: number;
    complete: boolean;
    totalMarksObtained: number | null;
    totalMaxMarks: number | null;
  };
}

export async function getReportCard(client: Client, studentId: string, examId: string, viewer: AppUser): Promise<ReportCard> {
  if (viewer.role === "STUDENT") await requireStudentOwnership(studentId, { client });

  const student = await findStudent(client, studentId); // RLS: admin / own / taught → else 404
  const exam = await findExam(client, examId);
  const enrollment = await findEnrollmentForYear(client, student.id, exam.academicYearId);
  if (!enrollment) throw notFound("The student was not enrolled in a class in that exam's academic year.");

  let visibleSubjects: Set<string> | null = null; // null = all subjects
  if (viewer.role === "TEACHER") {
    const teacherId = await findTeacherIdByUserId(client, viewer.id);
    if (!teacherId || !(await teacherHasAssignment(client, { teacherId, classId: enrollment.classId }))) {
      throw forbidden("You can only view report cards for classes you teach.");
    }
    visibleSubjects = await assignedSubjectIds(client, teacherId, enrollment.classId);
  } else if (viewer.role !== "ADMIN" && viewer.role !== "STUDENT") {
    throw forbidden();
  }

  const schoolClass = await findClass(client, enrollment.classId);
  const papers = (await papersForClass(client, exam.id, enrollment.classId)).filter(
    (paper) => visibleSubjects === null || visibleSubjects.has(paper.subjectId),
  );
  const marks = papers.length > 0 ? await resultsForStudent(client, student.id, papers.map((paper) => paper.id)) : [];
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
        status: result ? ("entered" as const) : ("notEntered" as const),
      };
    })
    .sort((a, b) => (a.subjectCode ?? "").localeCompare(b.subjectCode ?? "") || a.examSubjectId.localeCompare(b.examSubjectId));

  const withMarks = subjects.filter((subject) => subject.status === "entered");
  const complete = visibleSubjects === null && subjects.length > 0 && withMarks.length === subjects.length;
  const sum = (values: number[]) => fromHundredths(values.reduce((total, value) => total + toHundredths(value), 0));

  return {
    student: { id: student.id, admissionNumber: student.admissionNumber, fullName: student.user?.fullName ?? null },
    exam: { id: exam.id, name: exam.name, academicYearId: exam.academicYearId, startDate: exam.startDate, endDate: exam.endDate },
    class: { id: schoolClass.id, name: schoolClass.name, section: schoolClass.section },
    scope: visibleSubjects === null ? "allSubjects" : "assignedSubjects",
    subjects,
    summary: {
      subjectsConfigured: subjects.length,
      subjectsWithMarks: withMarks.length,
      complete,
      totalMarksObtained: complete ? sum(withMarks.map((subject) => subject.marksObtained as number)) : null,
      totalMaxMarks: complete ? sum(subjects.map((subject) => subject.maxMarks)) : null,
    },
  };
}
