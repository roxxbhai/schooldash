import { beforeEach, describe, expect, it, vi } from "vitest";

// Results service unit tests: repositories and guards mocked. No Supabase.
vi.mock("@/lib/auth/repository", () => ({ findTeacherIdByUserId: vi.fn(), teacherHasAssignment: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ requireStudentOwnership: vi.fn() }));
vi.mock("@/lib/exam-subjects/repository", () => ({ findExamSubject: vi.fn() }));
vi.mock("@/lib/students/repository", () => ({ studentActiveStates: vi.fn() }));
vi.mock("@/lib/enrollments/repository", () => ({ enrolledStudentIds: vi.fn() }));
vi.mock("@/lib/results/repository", () => ({
  insertResults: vi.fn(async (_c: unknown, rows: unknown[]) => rows),
  findResult: vi.fn(),
  updateResultIfUnchanged: vi.fn(),
  listResults: vi.fn(async () => ({ items: [], total: 0 })),
}));

import { ApiError } from "@/lib/api/errors";
import { toPagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { enrolledStudentIds } from "@/lib/enrollments/repository";
import { findExamSubject } from "@/lib/exam-subjects/repository";
import * as repo from "@/lib/results/repository";
import {
  bulkResultsSchema,
  correctResult,
  createResultSchema,
  enterResult,
  enterResults,
  listResults,
  updateResultSchema,
} from "@/lib/results/service";
import { studentActiveStates } from "@/lib/students/repository";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: AppUser = { id: ID(1), authUserId: "a", role: "ADMIN", isActive: true };
const teacher: AppUser = { id: ID(2), authUserId: "b", role: "TEACHER", isActive: true };
const student: AppUser = { id: ID(3), authUserId: "c", role: "STUDENT", isActive: true };
const PAPER = { id: ID(10), classId: ID(20), subjectId: ID(30), maxMarks: 50 };
const S1 = ID(40);
const S2 = ID(41);
const NOW = "2026-10-15T17:00:00.123456+00:00";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findExamSubject).mockResolvedValue(PAPER as never);
  vi.mocked(studentActiveStates).mockResolvedValue(new Map([[S1, true], [S2, true]]));
  vi.mocked(enrolledStudentIds).mockResolvedValue(new Set([S1, S2]));
});

describe("input validation", () => {
  it("rejects client-supplied classId / enteredByUserId", () => {
    for (const extra of [{ classId: ID(9) }, { enteredByUserId: ID(9) }]) {
      expect(createResultSchema.safeParse({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10, ...extra }).success).toBe(false);
    }
  });

  it("corrections must quote expectedUpdatedAt and change something", () => {
    expect(updateResultSchema.safeParse({ marksObtained: 10 }).success).toBe(false);
    expect(updateResultSchema.safeParse({ expectedUpdatedAt: NOW }).success).toBe(false);
    expect(updateResultSchema.safeParse({ marksObtained: 10, expectedUpdatedAt: NOW }).success).toBe(true);
    expect(updateResultSchema.safeParse({ marksObtained: 10, expectedUpdatedAt: "yesterday" }).success).toBe(false);
  });

  it("bulk: 1–200 records, no duplicate students", () => {
    expect(bulkResultsSchema.safeParse({ examSubjectId: PAPER.id, records: [] }).success).toBe(false);
    const dup = bulkResultsSchema.safeParse({ examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 1 }, { studentId: S1, marksObtained: 2 }] });
    expect(dup.error?.issues[0].path).toEqual(["records", 1, "studentId"]);
  });
});

describe("entering marks", () => {
  it("takes the class from the paper and records the actor; zero is a valid mark", async () => {
    await enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 0 }, admin);
    expect(repo.insertResults).toHaveBeenCalledWith(client, [
      { examSubjectId: PAPER.id, studentId: S1, marksObtained: 0, classId: PAPER.classId, enteredByUserId: admin.id },
    ]);
  });

  it("requires the teacher to be assigned to the paper's class AND subject", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(5));
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 }, teacher)).rejects.toMatchObject({ status: 403 });
    expect(teacherHasAssignment).toHaveBeenCalledWith(client, { teacherId: ID(5), classId: PAPER.classId, subjectId: PAPER.subjectId });
    expect(repo.insertResults).not.toHaveBeenCalled();
  });

  it("refuses students", async () => {
    await expect(enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 }, student)).rejects.toMatchObject({ status: 403 });
  });

  it("a teacher targeting a paper they cannot see gets 403 (existence not revealed)", async () => {
    vi.mocked(findExamSubject).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    await expect(enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 }, teacher)).rejects.toMatchObject({ status: 403 });
  });

  it("reports an unknown paper as 422 on examSubjectId", async () => {
    vi.mocked(findExamSubject).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    await expect(enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 }, admin)).rejects.toMatchObject({
      status: 422,
      details: [{ path: "examSubjectId" }],
    });
  });

  it.each([
    ["marks above maxMarks", { marksObtained: 50.01 }, () => {}, "marksObtained"],
    ["an unknown student", {}, () => { vi.mocked(studentActiveStates).mockResolvedValue(new Map()); }, "studentId"],
    ["a deactivated student", {}, () => { vi.mocked(studentActiveStates).mockResolvedValue(new Map([[S1, false]])); }, "studentId"],
    ["a student not enrolled in the paper's class", {}, () => { vi.mocked(enrolledStudentIds).mockResolvedValue(new Set()); }, "studentId"],
  ])("rejects %s (422) without writing", async (_label, override, arrange, path) => {
    arrange();
    await expect(enterResult(client, { examSubjectId: PAPER.id, studentId: S1, marksObtained: 20, ...override }, admin)).rejects.toMatchObject({
      status: 422,
      details: [expect.objectContaining({ path })],
    });
    expect(repo.insertResults).not.toHaveBeenCalled();
  });

  it("bulk: reports every invalid record by index and writes nothing; otherwise one insert", async () => {
    await expect(
      enterResults(client, { examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 10 }, { studentId: S2, marksObtained: 99 }] }, admin),
    ).rejects.toMatchObject({ status: 422, details: [{ path: "records.1.marksObtained" }] });
    expect(repo.insertResults).not.toHaveBeenCalled();

    const result = await enterResults(client, { examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 10 }, { studentId: S2, marksObtained: 0 }] }, admin);
    expect(repo.insertResults).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(2);
  });
});

describe("correcting marks (optimistic concurrency)", () => {
  beforeEach(() => {
    vi.mocked(repo.findResult).mockResolvedValue({ id: ID(60), examSubjectId: PAPER.id, updatedAt: NOW } as never);
  });

  it("applies the change only if updatedAt still matches; records the editor", async () => {
    vi.mocked(repo.updateResultIfUnchanged).mockResolvedValue({ id: ID(60) } as never);
    await correctResult(client, ID(60), { marksObtained: 45, expectedUpdatedAt: NOW }, admin);
    expect(repo.updateResultIfUnchanged).toHaveBeenCalledWith(client, ID(60), NOW, { marksObtained: 45, enteredByUserId: admin.id });
  });

  it("a stale write is a 409, not a silent overwrite", async () => {
    vi.mocked(repo.updateResultIfUnchanged).mockResolvedValue(null);
    await expect(correctResult(client, ID(60), { marksObtained: 45, expectedUpdatedAt: NOW }, admin)).rejects.toMatchObject({ status: 409 });
  });

  it("a result that vanished between read and write is a 404", async () => {
    vi.mocked(repo.updateResultIfUnchanged).mockResolvedValue(null);
    vi.mocked(repo.findResult).mockResolvedValueOnce({ id: ID(60), examSubjectId: PAPER.id } as never).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    await expect(correctResult(client, ID(60), { marksObtained: 45, expectedUpdatedAt: NOW }, admin)).rejects.toMatchObject({ status: 404 });
  });

  it("REGRESSION: an outage during the re-read is a 503, not a misleading 404", async () => {
    vi.mocked(repo.updateResultIfUnchanged).mockResolvedValue(null);
    vi.mocked(repo.findResult)
      .mockResolvedValueOnce({ id: ID(60), examSubjectId: PAPER.id } as never)
      .mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "x"));
    await expect(correctResult(client, ID(60), { marksObtained: 45, expectedUpdatedAt: NOW }, admin)).rejects.toMatchObject({ status: 503 });
  });

  it("rejects marks above maxMarks before writing", async () => {
    await expect(correctResult(client, ID(60), { marksObtained: 51, expectedUpdatedAt: NOW }, admin)).rejects.toMatchObject({ status: 422 });
    expect(repo.updateResultIfUnchanged).not.toHaveBeenCalled();
  });
});

describe("reading marks", () => {
  it("a student asking for another student's marks gets an ownership check", async () => {
    await listResults(client, toPagination({ page: 1, limit: 20 }), { studentId: S2 }, student);
    expect(requireStudentOwnership).toHaveBeenCalledWith(S2, { client });
  });
});
