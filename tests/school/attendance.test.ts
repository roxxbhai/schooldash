import { beforeEach, describe, expect, it, vi } from "vitest";

// Attendance service unit tests: repositories and guards are mocked. No Supabase.
vi.mock("@/lib/auth/repository", () => ({ findTeacherIdByUserId: vi.fn(), teacherHasAssignment: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ requireStudentOwnership: vi.fn() }));
vi.mock("@/lib/student-attendance/repository", () => ({
  findClassWithYear: vi.fn(),
  studentActiveStates: vi.fn(),
  enrolledStudentIds: vi.fn(),
  insertStudentAttendance: vi.fn(async (_c: unknown, rows: unknown[]) => rows),
  findStudentAttendance: vi.fn(),
  updateStudentAttendance: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
  listStudentAttendance: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock("@/lib/teacher-attendance/repository", () => ({
  insertTeacherAttendance: vi.fn(async (_c: unknown, row: unknown) => row),
  findTeacherAttendance: vi.fn(),
  updateTeacherAttendance: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
  listTeacherAttendance: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock("@/lib/teachers/repository", () => ({ findTeacherStatus: vi.fn() }));

import { toPagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { findTeacherIdByUserId, teacherHasAssignment } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { attendanceDateSchema, latestAttendanceDate } from "@/lib/school/validation";
import * as repo from "@/lib/student-attendance/repository";
import {
  bulkStudentAttendanceSchema,
  correctStudentAttendance,
  createStudentAttendanceSchema,
  listStudentAttendance,
  listStudentAttendanceQuerySchema,
  recordClassAttendance,
  recordStudentAttendance,
} from "@/lib/student-attendance/service";
import * as teacherAttendanceRepo from "@/lib/teacher-attendance/repository";
import { listTeacherAttendance, recordTeacherAttendance } from "@/lib/teacher-attendance/service";
import * as teacherRepo from "@/lib/teachers/repository";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: AppUser = { id: ID(1), authUserId: "a", role: "ADMIN", isActive: true };
const teacher: AppUser = { id: ID(2), authUserId: "b", role: "TEACHER", isActive: true };
const student: AppUser = { id: ID(3), authUserId: "c", role: "STUDENT", isActive: true };
const CLASS = ID(40);
const S1 = ID(31);
const S2 = ID(32);
const year = { id: CLASS, academicYear: { startDate: "2015-04-01", endDate: "2016-03-31" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findClassWithYear).mockResolvedValue(year);
  vi.mocked(repo.studentActiveStates).mockResolvedValue(new Map([[S1, true], [S2, true]]));
  vi.mocked(repo.enrolledStudentIds).mockResolvedValue(new Set([S1, S2]));
});

describe("attendance validation", () => {
  it("uses exactly the database statuses", () => {
    expect(createStudentAttendanceSchema.safeParse({ studentId: S1, classId: CLASS, attendanceDate: "2015-06-01", status: "late" }).success).toBe(true);
    for (const status of ["PRESENT", "holiday", ""]) {
      expect(createStudentAttendanceSchema.safeParse({ studentId: S1, classId: CLASS, attendanceDate: "2015-06-01", status }).success, status).toBe(false);
    }
  });

  it("rejects future and invalid dates; allows up to one day ahead of UTC", () => {
    expect(latestAttendanceDate(new Date("2026-10-15T23:00:00Z"))).toBe("2026-10-16");
    expect(attendanceDateSchema.safeParse("2999-01-01").success).toBe(false);
    expect(attendanceDateSchema.safeParse("2015-02-30").success).toBe(false);
    expect(attendanceDateSchema.safeParse(latestAttendanceDate()).success).toBe(true);
  });

  it("rejects client-supplied markedByUserId", () => {
    expect(createStudentAttendanceSchema.safeParse({ studentId: S1, classId: CLASS, attendanceDate: "2015-06-01", status: "present", markedByUserId: ID(9) }).success).toBe(false);
  });

  it("validates date filters", () => {
    expect(listStudentAttendanceQuerySchema.safeParse({ date: "2015-06-01", from: "2015-06-01" }).success).toBe(false);
    expect(listStudentAttendanceQuerySchema.safeParse({ from: "2015-06-02", to: "2015-06-01" }).success).toBe(false);
    expect(listStudentAttendanceQuerySchema.safeParse({ from: "2015-06-01", to: "2015-06-30", status: "absent" }).success).toBe(true);
  });

  it("bulk submissions: 1–200 records, no duplicate students", () => {
    const base = { classId: CLASS, attendanceDate: "2015-06-01" };
    expect(bulkStudentAttendanceSchema.safeParse({ ...base, records: [] }).success).toBe(false);
    const dup = bulkStudentAttendanceSchema.safeParse({ ...base, records: [{ studentId: S1, status: "present" }, { studentId: S1, status: "absent" }] });
    expect(dup.error?.issues[0].path).toEqual(["records", 1, "studentId"]);
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ studentId: ID(1000 + i), status: "present" }));
    expect(bulkStudentAttendanceSchema.safeParse({ ...base, records: tooMany }).success).toBe(false);
  });
});

describe("recording student attendance", () => {
  const input = { studentId: S1, classId: CLASS, attendanceDate: "2015-06-01", status: "present" as const };

  it("records the acting user as marker", async () => {
    await recordStudentAttendance(client, input, admin);
    expect(repo.insertStudentAttendance).toHaveBeenCalledWith(client, [{ ...input, markedByUserId: admin.id }]);
  });

  it("refuses a teacher who doesn't teach the class, before validating or writing", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(20));
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(recordStudentAttendance(client, input, teacher)).rejects.toMatchObject({ status: 403 });
    expect(teacherHasAssignment).toHaveBeenCalledWith(client, { teacherId: ID(20), classId: CLASS });
    expect(repo.findClassWithYear).not.toHaveBeenCalled();
    expect(repo.insertStudentAttendance).not.toHaveBeenCalled();
  });

  it("allows a teacher of the class", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(20));
    vi.mocked(teacherHasAssignment).mockResolvedValue(true);
    await recordStudentAttendance(client, input, teacher);
    expect(repo.insertStudentAttendance).toHaveBeenCalled();
  });

  it("refuses students outright", async () => {
    await expect(recordStudentAttendance(client, input, student)).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ["an unknown class", () => { vi.mocked(repo.findClassWithYear).mockResolvedValue(null); }, "classId", "Class not found."],
    ["a date outside the academic year", () => {}, "attendanceDate", "The date is outside the class's academic year.", "2016-06-01"],
    ["an unknown student", () => { vi.mocked(repo.studentActiveStates).mockResolvedValue(new Map()); }, "studentId", "Student not found."],
    ["a deactivated student", () => { vi.mocked(repo.studentActiveStates).mockResolvedValue(new Map([[S1, false]])); }, "studentId", "The student's account is deactivated."],
    ["a student not enrolled in the class", () => { vi.mocked(repo.enrolledStudentIds).mockResolvedValue(new Set()); }, "studentId", "The student is not enrolled in this class."],
  ])("rejects %s (422) without writing", async (_label, arrange, path, message, date = "2015-06-01") => {
    arrange();
    await expect(recordStudentAttendance(client, { ...input, attendanceDate: date }, admin)).rejects.toMatchObject({
      status: 422,
      details: [{ path, message }],
    });
    expect(repo.insertStudentAttendance).not.toHaveBeenCalled();
  });
});

describe("bulk class attendance", () => {
  const input = {
    classId: CLASS,
    attendanceDate: "2015-06-01",
    records: [
      { studentId: S1, status: "present" as const },
      { studentId: S2, status: "absent" as const, remarks: "sick" },
    ],
  };

  it("inserts every record in one call, marked by the actor", async () => {
    const result = await recordClassAttendance(client, input, admin);
    expect(repo.insertStudentAttendance).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repo.insertStudentAttendance).mock.calls[0][1]).toEqual([
      { studentId: S1, status: "present", classId: CLASS, attendanceDate: "2015-06-01", markedByUserId: admin.id },
      { studentId: S2, status: "absent", remarks: "sick", classId: CLASS, attendanceDate: "2015-06-01", markedByUserId: admin.id },
    ]);
    expect(result.count).toBe(2);
  });

  it("reports every invalid record by index and writes nothing", async () => {
    vi.mocked(repo.enrolledStudentIds).mockResolvedValue(new Set([S1]));
    vi.mocked(repo.studentActiveStates).mockResolvedValue(new Map([[S1, true], [S2, true]]));
    await expect(recordClassAttendance(client, input, admin)).rejects.toMatchObject({
      status: 422,
      details: [{ path: "records.1.studentId", message: "The student is not enrolled in this class." }],
    });
    expect(repo.insertStudentAttendance).not.toHaveBeenCalled();
  });
});

describe("correcting student attendance", () => {
  it("authorizes against the record's own class and records the editor", async () => {
    vi.mocked(repo.findStudentAttendance).mockResolvedValue({ classId: CLASS } as never);
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(20));
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(correctStudentAttendance(client, ID(60), { status: "late" }, teacher)).rejects.toMatchObject({ status: 403 });
    expect(repo.updateStudentAttendance).not.toHaveBeenCalled();

    await correctStudentAttendance(client, ID(60), { status: "late", remarks: null }, admin);
    expect(repo.updateStudentAttendance).toHaveBeenCalledWith(client, ID(60), { status: "late", remarks: null, markedByUserId: admin.id });
  });

  it("rejects an empty correction", async () => {
    await expect(correctStudentAttendance(client, ID(60), {}, admin)).rejects.toMatchObject({ status: 422 });
  });
});

describe("reading attendance", () => {
  it("a student asking for another student's attendance gets an ownership check", async () => {
    await listStudentAttendance(client, toPagination({ page: 1, limit: 20 }), { studentId: S2 }, student);
    expect(requireStudentOwnership).toHaveBeenCalledWith(S2, { client });
  });

  it("a teacher asking for another teacher's attendance gets 403", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(20));
    await expect(listTeacherAttendance(client, toPagination({ page: 1, limit: 20 }), { teacherId: ID(21) }, teacher)).rejects.toMatchObject({ status: 403 });
    await expect(listTeacherAttendance(client, toPagination({ page: 1, limit: 20 }), { teacherId: ID(20) }, teacher)).resolves.toBeDefined();
  });
});

describe("recording teacher attendance", () => {
  it("rejects a deactivated teacher before writing", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValue({ id: ID(20), user: { isActive: false } });
    await expect(recordTeacherAttendance(client, { teacherId: ID(20), attendanceDate: "2015-06-01", status: "present" }, admin)).rejects.toMatchObject({ status: 422 });
    expect(teacherAttendanceRepo.insertTeacherAttendance).not.toHaveBeenCalled();
  });

  it("records the acting admin as marker", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValue({ id: ID(20), user: { isActive: true } });
    await recordTeacherAttendance(client, { teacherId: ID(20), attendanceDate: "2015-06-01", status: "leave" }, admin);
    expect(teacherAttendanceRepo.insertTeacherAttendance).toHaveBeenCalledWith(client, {
      teacherId: ID(20),
      attendanceDate: "2015-06-01",
      status: "leave",
      markedByUserId: admin.id,
    });
  });
});
