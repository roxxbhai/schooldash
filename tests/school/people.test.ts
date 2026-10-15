import { beforeEach, describe, expect, it, vi } from "vitest";

// Service-layer unit tests: repositories, provisioning and guards are mocked. No Supabase.
vi.mock("@/lib/auth/provisioning", () => ({ provisionAccount: vi.fn(async () => ({ userId: "new-user" })) }));
vi.mock("@/lib/auth/repository", () => ({ findTeacherIdByUserId: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ requireStudentOwnership: vi.fn() }));
vi.mock("@/lib/teachers/repository", () => ({
  findTeacher: vi.fn(async () => ({ id: "t" })),
  findTeacherByUserId: vi.fn(async () => ({ id: "t" })),
  findTeacherStatus: vi.fn(),
  updateTeacherProfile: vi.fn(),
  listTeachers: vi.fn(),
}));
vi.mock("@/lib/students/repository", () => ({
  findStudent: vi.fn(async () => ({ id: "s" })),
  findStudentByUserId: vi.fn(async () => ({ id: "s" })),
  findStudentStatus: vi.fn(),
  updateStudentProfile: vi.fn(),
  listStudents: vi.fn(),
}));
vi.mock("@/lib/classes/repository", () => ({ findClass: vi.fn() }));
vi.mock("@/lib/enrollments/repository", () => ({
  findEnrollment: vi.fn(),
  insertEnrollment: vi.fn(async (_c: unknown, values: unknown) => values),
  updateEnrollment: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
  listEnrollments: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock("@/lib/teacher-assignments/repository", () => ({
  insertAssignment: vi.fn(async (_c: unknown, values: unknown) => values),
}));

import { ApiError } from "@/lib/api/errors";
import { toPagination } from "@/lib/api/validation";
import { requireStudentOwnership } from "@/lib/auth/authorization";
import { provisionAccount } from "@/lib/auth/provisioning";
import { findTeacherIdByUserId } from "@/lib/auth/repository";
import type { AppUser } from "@/lib/auth/session";
import { findClass } from "@/lib/classes/repository";
import * as enrollmentRepo from "@/lib/enrollments/repository";
import { createEnrollment, listEnrollments, updateEnrollment } from "@/lib/enrollments/service";
import * as studentRepo from "@/lib/students/repository";
import { createStudent, createStudentSchema, getStudent, updateStudentSchema } from "@/lib/students/service";
import * as assignmentRepo from "@/lib/teacher-assignments/repository";
import { createAssignment } from "@/lib/teacher-assignments/service";
import * as teacherRepo from "@/lib/teachers/repository";
import { createTeacher, createTeacherSchema, getTeacher, updateTeacher } from "@/lib/teachers/service";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin: AppUser = { id: ID(1), authUserId: "a", role: "ADMIN", isActive: true };
const teacher: AppUser = { id: ID(2), authUserId: "b", role: "TEACHER", isActive: true };
const student: AppUser = { id: ID(3), authUserId: "c", role: "STUDENT", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("teachers", () => {
  it("creates through provisioning with the role fixed to TEACHER and the admin as actor", async () => {
    const input = createTeacherSchema.parse({ email: "T@Example.com", fullName: "T", employeeCode: "E1" });
    await createTeacher(client, input, admin);
    expect(provisionAccount).toHaveBeenCalledWith(
      expect.objectContaining({ role: "TEACHER", email: "t@example.com", profile: expect.objectContaining({ employeeCode: "E1" }) }),
      { actorUserId: admin.id },
    );
  });

  it("rejects client-supplied role, status or ids in the body", () => {
    for (const extra of [{ role: "ADMIN" }, { isActive: false }, { userId: ID(9) }]) {
      expect(createTeacherSchema.safeParse({ email: "t@x.co", fullName: "T", employeeCode: "E", ...extra }).success).toBe(false);
    }
  });

  it("lets a teacher read only their own record, and never a student", async () => {
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(ID(20));
    await expect(getTeacher(client, ID(20), teacher)).resolves.toEqual({ id: "t" });
    await expect(getTeacher(client, ID(21), teacher)).rejects.toMatchObject({ status: 403 });
    await expect(getTeacher(client, ID(20), student)).rejects.toMatchObject({ status: 403 });
    await expect(getTeacher(client, ID(21), admin)).resolves.toEqual({ id: "t" });
  });

  it("splits an update into the users and profile patches", async () => {
    await updateTeacher(client, ID(20), { fullName: "New", qualification: null, phone: undefined });
    expect(teacherRepo.updateTeacherProfile).toHaveBeenCalledWith(client, ID(20), { fullName: "New" }, { qualification: null });
  });

  it("refuses an empty update", async () => {
    await expect(updateTeacher(client, ID(20), {})).rejects.toMatchObject({ status: 422 });
    expect(teacherRepo.updateTeacherProfile).not.toHaveBeenCalled();
  });
});

describe("students", () => {
  it("creates through provisioning with the role fixed to STUDENT", async () => {
    const input = createStudentSchema.parse({ email: "s@x.co", fullName: "S", admissionNumber: "A1", dateOfBirth: "2012-05-01" });
    await createStudent(client, input, admin);
    expect(provisionAccount).toHaveBeenCalledWith(
      { role: "STUDENT", email: "s@x.co", fullName: "S", password: undefined, profile: { admissionNumber: "A1", dateOfBirth: "2012-05-01" } },
      { actorUserId: admin.id },
    );
  });

  it("rejects role/status fields and malformed values", () => {
    expect(createStudentSchema.safeParse({ email: "s@x.co", fullName: "S", admissionNumber: "A", role: "ADMIN" }).success).toBe(false);
    expect(updateStudentSchema.safeParse({ isActive: true }).success).toBe(false);
    expect(createStudentSchema.safeParse({ email: "nope", fullName: "S", admissionNumber: "A" }).success).toBe(false);
    expect(createStudentSchema.safeParse({ email: "s@x.co", fullName: "S", admissionNumber: "A", password: "short" }).success).toBe(false);
  });

  it("checks ownership for students, and leaves admins/teachers to RLS", async () => {
    await getStudent(client, ID(30), student);
    expect(requireStudentOwnership).toHaveBeenCalledWith(ID(30), { client });
    vi.mocked(requireStudentOwnership).mockClear();
    await getStudent(client, ID(30), teacher);
    await getStudent(client, ID(30), admin);
    expect(requireStudentOwnership).not.toHaveBeenCalled();
  });
});

describe("enrollments", () => {
  const klass = { id: ID(40), academicYearId: ID(50) };

  it("takes the academic year from the class, never from the request", async () => {
    vi.mocked(studentRepo.findStudentStatus).mockResolvedValue({ id: ID(30), user: { isActive: true } });
    vi.mocked(findClass).mockResolvedValue(klass as never);
    await createEnrollment(client, { studentId: ID(30), classId: ID(40), rollNumber: 3 });
    expect(enrollmentRepo.insertEnrollment).toHaveBeenCalledWith(client, {
      studentId: ID(30),
      classId: ID(40),
      academicYearId: ID(50),
      rollNumber: 3,
    });
  });

  it("refuses deactivated or unknown students, and unknown classes, before writing", async () => {
    vi.mocked(studentRepo.findStudentStatus).mockResolvedValueOnce({ id: ID(30), user: { isActive: false } });
    await expect(createEnrollment(client, { studentId: ID(30), classId: ID(40) })).rejects.toMatchObject({ status: 422 });

    vi.mocked(studentRepo.findStudentStatus).mockResolvedValueOnce(null);
    await expect(createEnrollment(client, { studentId: ID(30), classId: ID(40) })).rejects.toMatchObject({ status: 422 });

    vi.mocked(studentRepo.findStudentStatus).mockResolvedValueOnce({ id: ID(30), user: { isActive: true } });
    vi.mocked(findClass).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Class not found."));
    await expect(createEnrollment(client, { studentId: ID(30), classId: ID(40) })).rejects.toMatchObject({
      status: 422,
      details: [{ path: "classId", message: "Class not found." }],
    });
    expect(enrollmentRepo.insertEnrollment).not.toHaveBeenCalled();
  });

  it("only moves a student to a class in the same academic year", async () => {
    vi.mocked(enrollmentRepo.findEnrollment).mockResolvedValue({ academicYearId: ID(50) } as never);
    vi.mocked(findClass).mockResolvedValueOnce({ id: ID(41), academicYearId: ID(51) } as never);
    await expect(updateEnrollment(client, ID(60), { classId: ID(41) })).rejects.toMatchObject({ status: 422 });

    vi.mocked(findClass).mockResolvedValueOnce({ id: ID(42), academicYearId: ID(50) } as never);
    await updateEnrollment(client, ID(60), { classId: ID(42) });
    expect(enrollmentRepo.updateEnrollment).toHaveBeenCalledWith(client, ID(60), { classId: ID(42) });
  });

  it("a student filtering by another student's id gets an explicit ownership check", async () => {
    await listEnrollments(client, toPagination({ page: 1, limit: 20 }), { studentId: ID(31) }, student);
    expect(requireStudentOwnership).toHaveBeenCalledWith(ID(31), { client });
  });
});

describe("teacher assignments", () => {
  it("refuses a deactivated teacher before writing", async () => {
    vi.mocked(teacherRepo.findTeacherStatus).mockResolvedValueOnce({ id: ID(20), user: { isActive: false } });
    await expect(createAssignment(client, { teacherId: ID(20), classId: ID(40), subjectId: ID(70) })).rejects.toMatchObject({
      status: 422,
      details: [{ path: "teacherId", message: "The teacher's account is deactivated." }],
    });
    expect(assignmentRepo.insertAssignment).not.toHaveBeenCalled();
  });
});
