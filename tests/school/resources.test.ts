import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests of the service layer: repositories are mocked, no Supabase.
vi.mock("@/lib/classes/repository", () => ({
  listClasses: vi.fn(),
  findClass: vi.fn(),
  insertClass: vi.fn(async (_c: unknown, values: unknown) => values),
  updateClass: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
}));
vi.mock("@/lib/teachers/repository", () => ({ findTeacherStatus: vi.fn() }));
vi.mock("@/lib/subjects/repository", () => ({
  listSubjects: vi.fn(async () => ({ items: [{ id: "s" }], total: 41 })),
  findSubject: vi.fn(),
  insertSubject: vi.fn(async (_c: unknown, values: unknown) => values),
  updateSubject: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
}));

import * as classRepo from "@/lib/classes/repository";
import * as teacherRepo from "@/lib/teachers/repository";
import { createClass, createClassSchema, updateClass, updateClassSchema } from "@/lib/classes/service";
import { createAcademicYearSchema, updateAcademicYearSchema } from "@/lib/academic-years/service";
import { createSubjectSchema, listSubjects, listSubjectsQuerySchema, updateSubject } from "@/lib/subjects/service";
import { toPagination } from "@/lib/api/validation";
import { requireChanges } from "@/lib/school/validation";

const client = {} as never;
const UUID = "3f2b8c1e-9d4a-4f6b-8e2c-1a7d5b9c0e3f";

beforeEach(() => vi.clearAllMocks());

describe("academic year validation", () => {
  it("accepts a valid year and rejects end before start", () => {
    expect(createAcademicYearSchema.safeParse({ name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31" }).success).toBe(true);
    const bad = createAcademicYearSchema.safeParse({ name: "x", startDate: "2027-01-01", endDate: "2026-01-01" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["endDate"]);
  });

  it("rejects isCurrent and unknown fields (current year changes only via set-current)", () => {
    expect(createAcademicYearSchema.safeParse({ name: "x", startDate: "2026-01-01", endDate: "2026-12-31", isCurrent: true }).success).toBe(false);
    expect(updateAcademicYearSchema.safeParse({ isCurrent: true }).success).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(createAcademicYearSchema.safeParse({ name: "x", startDate: "2026-02-30", endDate: "2026-12-31" }).success).toBe(false);
  });
});

describe("requireChanges", () => {
  it("rejects an empty update with 422 and drops undefined fields", () => {
    expect(() => requireChanges({})).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => requireChanges({ name: undefined })).toThrow(expect.objectContaining({ status: 422 }));
    expect(requireChanges({ name: "A", section: undefined, roomNumber: null })).toEqual({ name: "A", roomNumber: null });
  });
});

describe("subjects service", () => {
  it("normalizes codes to upper case and validates their format", () => {
    expect(createSubjectSchema.parse({ code: " math-10 ", name: "Maths" })).toEqual({ code: "MATH-10", name: "Maths" });
    expect(createSubjectSchema.safeParse({ code: "ma th", name: "x" }).success).toBe(false);
  });

  it("clears blank descriptions to null", () => {
    expect(createSubjectSchema.parse({ code: "A", name: "B", description: "  " }).description).toBeNull();
  });

  it("restricts search terms so they cannot inject PostgREST filter syntax", () => {
    for (const bad of ["a,b", "x)", "name.eq.y,code", "a(b"]) {
      expect(listSubjectsQuerySchema.safeParse({ search: bad }).success, bad).toBe(false);
    }
    expect(listSubjectsQuerySchema.safeParse({ search: "Social Sci-10" }).success).toBe(true);
  });

  it("returns items with pagination metadata", async () => {
    await expect(listSubjects(client, toPagination({ page: 2, limit: 20 }))).resolves.toEqual({
      items: [{ id: "s" }],
      pagination: { page: 2, limit: 20, total: 41, totalPages: 3 },
    });
  });

  it("rejects an empty update before touching the database", async () => {
    await expect(updateSubject(client, UUID, {} as never)).rejects.toMatchObject({ status: 422 });
  });
});

describe("classes service", () => {
  const base = { academicYearId: UUID, name: "10", section: "A" };

  it("does not allow moving a class to another academic year", () => {
    expect(updateClassSchema.safeParse({ academicYearId: UUID }).success).toBe(false);
  });

  it("requires an existing class teacher", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValueOnce(null);
    await expect(createClass(client, createClassSchema.parse({ ...base, classTeacherId: UUID }))).rejects.toMatchObject({
      status: 422,
      details: [{ path: "classTeacherId", message: "Teacher not found." }],
    });
    expect(classRepo.insertClass).not.toHaveBeenCalled();
  });

  it("rejects a deactivated class teacher", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValueOnce({ id: UUID, user: { isActive: false } });
    await expect(updateClass(client, UUID, { classTeacherId: UUID })).rejects.toMatchObject({ status: 422 });
    expect(classRepo.updateClass).not.toHaveBeenCalled();
  });

  it("accepts an active class teacher, or clearing it", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValueOnce({ id: UUID, user: { isActive: true } });
    await createClass(client, createClassSchema.parse({ ...base, classTeacherId: UUID }));
    expect(classRepo.insertClass).toHaveBeenCalled();

    await updateClass(client, UUID, { classTeacherId: null });
    expect(teacherRepo.findTeacherStatus).toHaveBeenCalledTimes(1);
    expect(classRepo.updateClass).toHaveBeenCalledWith(client, UUID, { classTeacherId: null });
  });
});
