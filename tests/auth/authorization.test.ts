import { AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  requireAdmin,
  requireAuthenticatedUser,
  requireRole,
  requireStudentOwnership,
  requireTeacherAssignment,
} from "@/lib/auth/authorization";
import { authUser, fakeSupabase } from "../helpers/fake-supabase";
import type { Row } from "../helpers/fake-supabase";

// --- Fixture school -----------------------------------------------------------
// Two students, two teachers, one admin. Teacher A teaches Maths to class 10-A
// and is class teacher of 10-B; teacher B teaches Science to 10-A.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const AUTH = { admin: id(1), studentA: id(2), studentB: id(3), teacherA: id(4), teacherB: id(5), inactiveAdmin: id(6) };
const USERS = { admin: id(11), studentA: id(12), studentB: id(13), teacherA: id(14), teacherB: id(15), inactiveAdmin: id(16) };
const STUDENT = { a: id(21), b: id(22) };
const TEACHER = { a: id(31), b: id(32) };
const CLASS = { tenA: id(41), tenB: id(42), tenC: id(43) };
const SUBJECT = { maths: id(51), science: id(52) };

const tables: Record<string, Row[]> = {
  users: [
    { id: USERS.admin, authUserId: AUTH.admin, role: "admin", isActive: true },
    { id: USERS.inactiveAdmin, authUserId: AUTH.inactiveAdmin, role: "admin", isActive: false },
    { id: USERS.studentA, authUserId: AUTH.studentA, role: "student", isActive: true },
    { id: USERS.studentB, authUserId: AUTH.studentB, role: "student", isActive: true },
    { id: USERS.teacherA, authUserId: AUTH.teacherA, role: "teacher", isActive: true },
    { id: USERS.teacherB, authUserId: AUTH.teacherB, role: "teacher", isActive: true },
  ],
  students: [
    { id: STUDENT.a, userId: USERS.studentA },
    { id: STUDENT.b, userId: USERS.studentB },
  ],
  teachers: [
    { id: TEACHER.a, userId: USERS.teacherA },
    { id: TEACHER.b, userId: USERS.teacherB },
  ],
  teacherAssignments: [
    { id: id(61), teacherId: TEACHER.a, classId: CLASS.tenA, subjectId: SUBJECT.maths },
    { id: id(62), teacherId: TEACHER.b, classId: CLASS.tenA, subjectId: SUBJECT.science },
  ],
  classes: [
    { id: CLASS.tenA, classTeacherId: null },
    { id: CLASS.tenB, classTeacherId: TEACHER.a },
    { id: CLASS.tenC, classTeacherId: null },
  ],
};

type Who = keyof typeof AUTH;
const as = (who: Who, metadata: Record<string, unknown> = {}) =>
  ({ client: fakeSupabase({ user: authUser(AUTH[who], metadata), tables }).client });
const anonymous = () => ({ client: fakeSupabase({ authError: new AuthSessionMissingError(), tables }).client });

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
}

describe("requireAuthenticatedUser", () => {
  it("returns the active application user", async () => {
    await expect(requireAuthenticatedUser(as("studentA"))).resolves.toMatchObject({
      id: USERS.studentA,
      role: "STUDENT",
    });
  });

  it("returns 401 without a session", async () => {
    expect(await statusOf(requireAuthenticatedUser(anonymous()))).toBe(401);
  });
});

describe("requireRole / requireAdmin", () => {
  it("allows an active admin", async () => {
    await expect(requireAdmin(as("admin"))).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("rejects an inactive admin with 403", async () => {
    expect(await statusOf(requireAdmin(as("inactiveAdmin")))).toBe(403);
  });

  it("returns 401 for unauthenticated callers", async () => {
    expect(await statusOf(requireAdmin(anonymous()))).toBe(401);
    expect(await statusOf(requireRole(["STUDENT"], anonymous()))).toBe(401);
  });

  it("returns 403 when a student invokes an admin-only operation", async () => {
    expect(await statusOf(requireAdmin(as("studentA")))).toBe(403);
    expect(await statusOf(requireAdmin(as("teacherA")))).toBe(403);
  });

  it("admits any of several allowed roles", async () => {
    expect(await statusOf(requireRole(["TEACHER", "ADMIN"], as("teacherA")))).toBe(200);
    expect(await statusOf(requireRole(["TEACHER", "ADMIN"], as("admin")))).toBe(200);
    expect(await statusOf(requireRole(["TEACHER", "ADMIN"], as("studentA")))).toBe(403);
  });

  it("ignores roles claimed in Supabase Auth metadata", async () => {
    const claimsAdmin = as("studentA", { role: "ADMIN", roles: ["admin"] });
    expect(await statusOf(requireAdmin(claimsAdmin))).toBe(403);
  });

  it("refuses to run with no allowed roles", async () => {
    await expect(requireRole([], as("admin"))).rejects.toThrow(/at least one/);
  });
});

describe("requireStudentOwnership", () => {
  it("lets a student access their own record", async () => {
    await expect(requireStudentOwnership(STUDENT.a, as("studentA"))).resolves.toEqual({
      user: expect.objectContaining({ id: USERS.studentA }),
      studentId: STUDENT.a,
      grantedBy: "owner",
    });
  });

  it("returns 403 when a student requests another student's record", async () => {
    expect(await statusOf(requireStudentOwnership(STUDENT.b, as("studentA")))).toBe(403);
  });

  it("rejects admins unless the caller explicitly allows them", async () => {
    expect(await statusOf(requireStudentOwnership(STUDENT.a, as("admin")))).toBe(403);
    await expect(
      requireStudentOwnership(STUDENT.a, { ...as("admin"), allowAdmin: true }),
    ).resolves.toMatchObject({ grantedBy: "admin" });
  });

  it("allowAdmin does not admit students to other students' records", async () => {
    expect(
      await statusOf(requireStudentOwnership(STUDENT.b, { ...as("studentA"), allowAdmin: true })),
    ).toBe(403);
  });

  it("rejects teachers (they are authorized through assignments instead)", async () => {
    expect(await statusOf(requireStudentOwnership(STUDENT.a, as("teacherA")))).toBe(403);
  });

  it("returns 401 before validating input for unauthenticated callers", async () => {
    expect(await statusOf(requireStudentOwnership("not-a-uuid", anonymous()))).toBe(401);
  });

  it("returns 400 for a malformed student id", async () => {
    expect(await statusOf(requireStudentOwnership("not-a-uuid", as("studentA")))).toBe(400);
  });
});

describe("requireTeacherAssignment", () => {
  it("allows a teacher for an assigned class and subject", async () => {
    await expect(
      requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.maths, as("teacherA")),
    ).resolves.toMatchObject({ teacherId: TEACHER.a, classId: CLASS.tenA, subjectId: SUBJECT.maths });
  });

  it("allows a teacher for an assigned class when no subject is given", async () => {
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, undefined, as("teacherA")))).toBe(200);
  });

  it("treats the class teacher as assigned to the class, but not to unassigned subjects", async () => {
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenB, undefined, as("teacherA")))).toBe(200);
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenB, SUBJECT.maths, as("teacherA")))).toBe(403);
  });

  describe("cannot be bypassed by changing request parameters", () => {
    it("passing another teacher's id", async () => {
      // Teacher B is assigned to Science in 10-A; teacher A claims to be B.
      expect(
        await statusOf(requireTeacherAssignment(TEACHER.b, CLASS.tenA, SUBJECT.science, as("teacherA"))),
      ).toBe(403);
    });

    it("requesting an unassigned class", async () => {
      expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenC, undefined, as("teacherA")))).toBe(403);
    });

    it("requesting a subject taught by someone else in an assigned class", async () => {
      expect(
        await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.science, as("teacherA"))),
      ).toBe(403);
    });

    it("passing a student's or user's id as the teacher id", async () => {
      expect(await statusOf(requireTeacherAssignment(USERS.teacherA, CLASS.tenA, undefined, as("teacherA")))).toBe(403);
    });
  });

  it("rejects non-teachers, including admins and students", async () => {
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.maths, as("admin")))).toBe(403);
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.maths, as("studentA")))).toBe(403);
  });

  it("returns 401 without a session", async () => {
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.maths, anonymous()))).toBe(401);
  });

  it("returns 400 for malformed ids", async () => {
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, "10-A", undefined, as("teacherA")))).toBe(400);
    expect(await statusOf(requireTeacherAssignment(TEACHER.a, CLASS.tenA, "maths", as("teacherA")))).toBe(400);
  });

  it("checks the assignment with the exact teacher, class and subject", async () => {
    const { client, queries } = fakeSupabase({ user: authUser(AUTH.teacherA), tables });
    await requireTeacherAssignment(TEACHER.a, CLASS.tenA, SUBJECT.maths, { client });
    expect(queries.find((q) => q.table === "teacherAssignments")?.filters).toEqual([
      ["teacherId", TEACHER.a],
      ["classId", CLASS.tenA],
      ["subjectId", SUBJECT.maths],
    ]);
  });
});
