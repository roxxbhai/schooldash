import { beforeEach, describe, expect, it, vi } from "vitest";

// Exam & exam-subject service unit tests: repositories mocked. No Supabase.
vi.mock("@/lib/academic-years/repository", () => ({ findAcademicYear: vi.fn() }));
vi.mock("@/lib/classes/repository", () => ({ findClass: vi.fn() }));
vi.mock("@/lib/exams/repository", () => ({
  findExam: vi.fn(),
  insertExam: vi.fn(async (_c: unknown, v: unknown) => v),
  updateExam: vi.fn(async (_c: unknown, _id: string, v: unknown) => v),
  listExams: vi.fn(),
}));
vi.mock("@/lib/exam-subjects/repository", () => ({
  findExamSubject: vi.fn(),
  insertExamSubject: vi.fn(async (_c: unknown, v: unknown) => v),
  updateExamSubject: vi.fn(async (_c: unknown, _id: string, v: unknown) => v),
  highestMark: vi.fn(),
  listExamSubjects: vi.fn(),
}));

import { findAcademicYear } from "@/lib/academic-years/repository";
import { ApiError } from "@/lib/api/errors";
import { findClass } from "@/lib/classes/repository";
import * as subjectRepo from "@/lib/exam-subjects/repository";
import { createExamSubject, createExamSubjectSchema, updateExamSubject } from "@/lib/exam-subjects/service";
import * as examRepo from "@/lib/exams/repository";
import { createExam, createExamSchema, updateExam } from "@/lib/exams/service";
import { marksSchema } from "@/lib/school/validation";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const YEAR = { id: ID(1), startDate: "2023-04-01", endDate: "2024-03-31" };
const EXAM = { id: ID(2), academicYearId: ID(1), startDate: "2023-09-01", endDate: "2023-09-30" };
const notFound = () => new ApiError(404, "NOT_FOUND", "x");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findAcademicYear).mockResolvedValue(YEAR as never);
  vi.mocked(examRepo.findExam).mockResolvedValue(EXAM as never);
  vi.mocked(findClass).mockResolvedValue({ id: ID(3), academicYearId: ID(1) } as never);
});

describe("marks values", () => {
  it("accept 0–9999.99 with at most two decimals", () => {
    for (const ok of [0, 1, 33.5, 33.33, 9999.99]) expect(marksSchema.safeParse(ok).success, String(ok)).toBe(true);
    for (const bad of [-1, 33.335, 10000, Number.NaN]) expect(marksSchema.safeParse(bad).success, String(bad)).toBe(false);
  });
});

describe("exams", () => {
  it("rejects end before start and unknown fields", () => {
    expect(createExamSchema.safeParse({ academicYearId: ID(1), name: "T1", startDate: "2023-09-10", endDate: "2023-09-01" }).success).toBe(false);
    expect(createExamSchema.safeParse({ academicYearId: ID(1), name: "T1", type: "final" }).success).toBe(false);
  });

  it("requires an existing academic year (422) and dates inside it (422)", async () => {
    vi.mocked(findAcademicYear).mockRejectedValueOnce(notFound());
    await expect(createExam(client, { academicYearId: ID(9), name: "T1" })).rejects.toMatchObject({ status: 422, details: [{ path: "academicYearId" }] });
    await expect(createExam(client, { academicYearId: ID(1), name: "T1", startDate: "2023-01-01" })).rejects.toMatchObject({ status: 422, details: [{ path: "startDate" }] });
    expect(examRepo.insertExam).not.toHaveBeenCalled();
  });

  it("validates updates against the merged dates", async () => {
    await expect(updateExam(client, ID(2), { endDate: "2023-08-01" })).rejects.toMatchObject({ status: 422 }); // before existing start
    await updateExam(client, ID(2), { startDate: null, endDate: null });
    expect(examRepo.updateExam).toHaveBeenCalledWith(client, ID(2), { startDate: null, endDate: null });
  });
});

describe("exam subjects", () => {
  const input = { examId: ID(2), classId: ID(3), subjectId: ID(4), maxMarks: 100 };

  it("takes the academic year from the exam", async () => {
    await createExamSubject(client, createExamSubjectSchema.parse(input));
    expect(subjectRepo.insertExamSubject).toHaveBeenCalledWith(client, expect.objectContaining({ academicYearId: ID(1) }));
  });

  it("rejects a class from another academic year", async () => {
    vi.mocked(findClass).mockResolvedValueOnce({ id: ID(3), academicYearId: ID(8) } as never);
    await expect(createExamSubject(client, input)).rejects.toMatchObject({ status: 422, details: [{ path: "classId" }] });
  });

  it("reports missing exam/class as 422 on the field", async () => {
    vi.mocked(examRepo.findExam).mockRejectedValueOnce(notFound());
    await expect(createExamSubject(client, input)).rejects.toMatchObject({ status: 422, details: [{ path: "examId" }] });
    vi.mocked(findClass).mockRejectedValueOnce(notFound());
    await expect(createExamSubject(client, input)).rejects.toMatchObject({ status: 422, details: [{ path: "classId" }] });
  });

  it("keeps examDate within the exam's dates", async () => {
    await expect(createExamSubject(client, { ...input, examDate: "2023-10-05" })).rejects.toMatchObject({ status: 422, details: [{ path: "examDate" }] });
    await createExamSubject(client, { ...input, examDate: "2023-09-15" });
    expect(subjectRepo.insertExamSubject).toHaveBeenCalledTimes(1);
  });

  it("validates maxMarks and passMarks", () => {
    expect(createExamSubjectSchema.safeParse({ ...input, maxMarks: 0 }).success).toBe(false);
    expect(createExamSubjectSchema.safeParse({ ...input, passMarks: 101 }).success).toBe(false);
    expect(createExamSubjectSchema.safeParse({ ...input, maxMarks: 50.555 }).success).toBe(false);
  });

  it("refuses to lower maxMarks below an entered mark (409), allows it otherwise", async () => {
    vi.mocked(subjectRepo.findExamSubject).mockResolvedValue({ id: ID(5), examId: ID(2), maxMarks: 100, passMarks: 35 } as never);
    vi.mocked(subjectRepo.highestMark).mockResolvedValue(88);
    await expect(updateExamSubject(client, ID(5), { maxMarks: 80 })).rejects.toMatchObject({ status: 409 });
    await updateExamSubject(client, ID(5), { maxMarks: 90 });
    expect(subjectRepo.updateExamSubject).toHaveBeenCalledWith(client, ID(5), { maxMarks: 90 });
  });

  it("rejects passMarks above the (new) maxMarks", async () => {
    vi.mocked(subjectRepo.findExamSubject).mockResolvedValue({ id: ID(5), examId: ID(2), maxMarks: 100, passMarks: 35 } as never);
    vi.mocked(subjectRepo.highestMark).mockResolvedValue(null);
    await expect(updateExamSubject(client, ID(5), { maxMarks: 30 })).rejects.toMatchObject({ status: 422, details: [{ path: "passMarks" }] });
  });
});
