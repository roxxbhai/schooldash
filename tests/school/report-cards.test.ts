import { beforeEach, describe, expect, it, vi } from "vitest";

// Report-card service unit tests: repositories mocked. No Supabase.
vi.mock("@/lib/auth/authorization", () => ({ requireStudentOwnership: vi.fn() }));
vi.mock("@/lib/auth/repository", () => ({ findTeacherIdByUserId: vi.fn(), teacherHasAssignment: vi.fn() }));
vi.mock("@/lib/students/repository", () => ({ findStudent: vi.fn() }));
vi.mock("@/lib/exams/repository", () => ({ findExam: vi.fn() }));
vi.mock("@/lib/enrollments/repository", () => ({ findEnrollmentForYear: vi.fn() }));
vi.mock("@/lib/classes/repository", () => ({ findClass: vi.fn() }));
vi.mock("@/lib/exam-subjects/repository", () => ({ papersForClass: vi.fn() }));
vi.mock("@/lib/results/repository", () => ({ resultsForStudent: vi.fn() }));
vi.mock("@/lib/teacher-assignments/repository", () => ({ assignedSubjectIds: vi.fn() }));

import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { findClass } from "@/lib/classes/repository";
import { findEnrollmentForYear } from "@/lib/enrollments/repository";
import { papersForClass } from "@/lib/exam-subjects/repository";
import { findExam } from "@/lib/exams/repository";
import { getReportCard } from "@/lib/report-cards/service";
import { resultsForStudent } from "@/lib/results/repository";
import { findStudent } from "@/lib/students/repository";
import { assignedSubjectIds } from "@/lib/teacher-assignments/repository";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: AppUser = { id: ID(1), authUserId: "a", role: "ADMIN", isActive: true };
const teacher: AppUser = { id: ID(2), authUserId: "b", role: "TEACHER", isActive: true };
const student: AppUser = { id: ID(3), authUserId: "c", role: "STUDENT", isActive: true };
const STUDENT_ID = ID(10);
const EXAM_ID = ID(20);
const CLASS_ID = ID(30);
const paper = (n: number, code: string, max: number) => ({
  id: ID(100 + n), subjectId: ID(200 + n), maxMarks: max, passMarks: null, examDate: null, subject: { code, name: code },
});
const PAPERS = [paper(1, "ENG", 33.33), paper(2, "MATH", 33.33), paper(3, "SCI", 33.34)];
const mark = (n: number, marks: number) => ({ examSubjectId: ID(100 + n), marksObtained: marks, remarks: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findStudent).mockResolvedValue({ id: STUDENT_ID, admissionNumber: "A1", user: { fullName: "Asha" } } as never);
  vi.mocked(findExam).mockResolvedValue({ id: EXAM_ID, name: "Term 1", academicYearId: ID(40), startDate: null, endDate: null } as never);
  vi.mocked(findEnrollmentForYear).mockResolvedValue({ classId: CLASS_ID } as never);
  vi.mocked(findClass).mockResolvedValue({ id: CLASS_ID, name: "10", section: "A" } as never);
  vi.mocked(papersForClass).mockResolvedValue(PAPERS as never);
});

describe("totals", () => {
  it("are exact when complete (no floating-point drift) and include zero marks", async () => {
    vi.mocked(resultsForStudent).mockResolvedValue([mark(1, 33.33), mark(2, 0), mark(3, 33.34)] as never);
    const card = await getReportCard(client, STUDENT_ID, EXAM_ID, admin);
    expect(card.summary).toEqual({ subjectsConfigured: 3, subjectsWithMarks: 3, complete: true, totalMarksObtained: 66.67, totalMaxMarks: 100 });
    expect(0.1 + 0.2).not.toBe(0.3); // the drift the hundredths arithmetic avoids
  });

  it("are null when any mark is missing; missing marks are not zero", async () => {
    vi.mocked(resultsForStudent).mockResolvedValue([mark(1, 30), mark(3, 20)] as never);
    const card = await getReportCard(client, STUDENT_ID, EXAM_ID, admin);
    expect(card.summary).toMatchObject({ subjectsWithMarks: 2, complete: false, totalMarksObtained: null, totalMaxMarks: null });
    expect(card.subjects.find((s) => s.subjectCode === "MATH")).toMatchObject({ marksObtained: null, status: "notEntered" });
  });

  it("a card with no configured subjects is not complete", async () => {
    vi.mocked(papersForClass).mockResolvedValue([]);
    const card = await getReportCard(client, STUDENT_ID, EXAM_ID, admin);
    expect(card.summary).toMatchObject({ subjectsConfigured: 0, complete: false, totalMarksObtained: null });
    expect(resultsForStudent).not.toHaveBeenCalled();
  });

  it("returns subjects ordered by code with maxMarks/passMarks as configured; no percentage or grade", async () => {
    vi.mocked(resultsForStudent).mockResolvedValue([] as never);
    const card = await getReportCard(client, STUDENT_ID, EXAM_ID, admin);
    expect(card.subjects.map((s) => s.subjectCode)).toEqual(["ENG", "MATH", "SCI"]);
    expect(card).not.toHaveProperty("percentage");
    expect(card.summary).not.toHaveProperty("grade");
  });
});

describe("access", () => {
  it("a student is checked for ownership first", async () => {
    vi.mocked(resultsForStudent).mockResolvedValue([] as never);
    await getReportCard(client, STUDENT_ID, EXAM_ID, student);
    expect(requireStudentOwnership).toHaveBeenCalledWith(STUDENT_ID, { client });
  });

  it("a teacher sees only assigned subjects and never totals", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(5));
    vi.mocked(teacherHasAssignment).mockResolvedValue(true);
    vi.mocked(assignedSubjectIds).mockResolvedValue(new Set([ID(202)]));
    vi.mocked(resultsForStudent).mockResolvedValue([mark(2, 30)] as never);
    const card = await getReportCard(client, STUDENT_ID, EXAM_ID, teacher);
    expect(card.scope).toBe("assignedSubjects");
    expect(card.subjects.map((s) => s.subjectCode)).toEqual(["MATH"]);
    expect(card.summary).toMatchObject({ complete: false, totalMarksObtained: null });
  });

  it("a teacher who doesn't teach the student's class that year gets 403", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(5));
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(getReportCard(client, STUDENT_ID, EXAM_ID, teacher)).rejects.toMatchObject({ status: 403 });
  });

  it("404 when the student wasn't enrolled in the exam's academic year", async () => {
    vi.mocked(findEnrollmentForYear).mockResolvedValue(null);
    await expect(getReportCard(client, STUDENT_ID, EXAM_ID, admin)).rejects.toMatchObject({ status: 404 });
  });
});
