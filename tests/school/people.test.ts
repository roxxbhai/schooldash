import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE TEACHER, STUDENT, ENROLLMENT AND ASSIGNMENT ROUTES: REAL
// HANDLERS, A RECORDING FAKE DATABASE CLIENT, STUBBED GUARDS AND PROVISIONING.
// NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/provisioning', () => ({
  provisionAccount: vi.fn(async () => ({ success: true, message: '', data: { userId: 'new-user' } })),
}));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
  findTeacherIdByUserId: vi.fn(),
  requireStudentOwnership: vi.fn(async () => ({ success: true, message: '', data: null })),
}));

import * as enrollments from '@/app/api/enrollments/route';
import * as enrollment from '@/app/api/enrollments/[id]/route';
import * as students from '@/app/api/students/route';
import * as student from '@/app/api/students/[id]/route';
import * as assignments from '@/app/api/teacher-assignments/route';
import * as teachers from '@/app/api/teachers/route';
import * as teacher from '@/app/api/teachers/[id]/route';
import { findTeacherIdByUserId, requireStudentOwnership } from '@/functions/authorization';
import { provisionAccount } from '@/functions/provisioning';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { okResult } from '../helpers/function-result';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = makeUser('ADMIN', ID(1));
const teacherUser = makeUser('TEACHER', ID(2));
const studentUser = makeUser('STUDENT', ID(3));
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

describe('teachers', () => {
  it('creates through provisioning with the role fixed to TEACHER and the admin as actor', async () => {
    db.respondTo('teachers.select', { data: { id: 't' } });
    const result = await callRoute(teachers.POST, { body: { email: 'T@Example.com', fullName: 'T', phone: '+91 98765-43210', employeeCode: 'E1' } });
    expect(result.status).toBe(201);
    expect(provisionAccount).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'TEACHER', email: 't@example.com', phone: '9876543210', profile: expect.objectContaining({ employeeCode: 'E1' }) }),
      { actorUserId: admin.id },
    );
  });

  it('rejects client-supplied role, status or ids in the body', async () => {
    for (const extra of [{ role: 'ADMIN' }, { isActive: false }, { userId: ID(9) }]) {
      const result = await callRoute(teachers.POST, { body: { email: 't@x.co', fullName: 'T', phone: '9876543210', employeeCode: 'E', ...extra } });
      expect(result.status).toBe(422);
    }
    expect(provisionAccount).not.toHaveBeenCalled();
  });

  it('lets a teacher read only their own record, and never a student', async () => {
    db.respondTo('teachers.select', { data: { id: 't' } });
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(okResult(ID(20)));
    const read = (id: string) => callRoute(teacher.GET, { params: { id } });

    actAs(teacherUser);
    expect((await read(ID(20))).body.data).toEqual({ id: 't' });
    expect((await read(ID(21))).status).toBe(403);
    actAs(studentUser);
    expect((await read(ID(20))).status).toBe(403);
    actAs(admin);
    expect((await read(ID(21))).body.data).toEqual({ id: 't' });
  });

  it('splits an update into the users and profile patches (one atomic database function)', async () => {
    await callRoute(teacher.PATCH, { method: 'PATCH', params: { id: ID(20) }, body: { fullName: 'New', qualification: null } });
    expect(db.callsTo('updateTeacherProfile', 'rpc')[0].payload).toEqual({
      teacherId: ID(20),
      userPatch: { fullName: 'New' },
      profilePatch: { qualification: null },
    });
  });

  it('refuses an empty update', async () => {
    expect((await callRoute(teacher.PATCH, { method: 'PATCH', params: { id: ID(20) }, body: {} })).status).toBe(422);
    expect(db.callsTo('updateTeacherProfile')).toHaveLength(0);
  });
});

describe('students', () => {
  it('creates through provisioning with the role fixed to STUDENT', async () => {
    db.respondTo('students.select', { data: { id: 's' } });
    await callRoute(students.POST, { body: { email: 's@x.co', fullName: 'S', admissionNumber: 'A1', dateOfBirth: '2012-05-01' } });
    expect(provisionAccount).toHaveBeenCalledWith(
      { role: 'STUDENT', email: 's@x.co', fullName: 'S', password: undefined, profile: { admissionNumber: 'A1', dateOfBirth: '2012-05-01' } },
      { actorUserId: admin.id },
    );
  });

  it('rejects role/status fields and malformed values', async () => {
    const create = (body: object) => callRoute(students.POST, { body });
    expect((await create({ email: 's@x.co', fullName: 'S', admissionNumber: 'A', role: 'ADMIN' })).status).toBe(422);
    expect((await callRoute(student.PATCH, { method: 'PATCH', params: { id: ID(30) }, body: { isActive: true } })).status).toBe(422);
    expect((await create({ email: 'nope', fullName: 'S', admissionNumber: 'A' })).status).toBe(422);
    expect((await create({ email: 's@x.co', fullName: 'S', admissionNumber: 'A', password: 'short' })).status).toBe(422);
    expect(provisionAccount).not.toHaveBeenCalled();
  });

  it('checks ownership for students, and leaves admins/teachers to RLS', async () => {
    db.respondTo('students.select', { data: { id: 's' } });
    actAs(studentUser);
    await callRoute(student.GET, { params: { id: ID(30) } });
    expect(requireStudentOwnership).toHaveBeenCalledWith(db.client, ID(30));
    vi.mocked(requireStudentOwnership).mockClear();
    actAs(teacherUser);
    await callRoute(student.GET, { params: { id: ID(30) } });
    actAs(admin);
    await callRoute(student.GET, { params: { id: ID(30) } });
    expect(requireStudentOwnership).not.toHaveBeenCalled();
  });
});

describe('enrollments', () => {
  const klass = { id: ID(40), academicYearId: ID(50) };
  const create = (body: object) => callRoute(enrollments.POST, { body });

  it('takes the academic year from the class, never from the request', async () => {
    db.respondTo('students.select', { data: { id: ID(30), user: { isActive: true } } });
    db.respondTo('classes.select', { data: klass });
    db.respondTo('studentEnrollments.insert', { data: { id: ID(60) } });
    expect((await create({ studentId: ID(30), classId: ID(40), rollNumber: 3 })).status).toBe(201);
    expect(db.callsTo('studentEnrollments', 'insert')[0].payload).toEqual({
      studentId: ID(30),
      classId: ID(40),
      academicYearId: ID(50),
      rollNumber: 3,
    });
  });

  it('refuses deactivated or unknown students, and unknown classes, before writing', async () => {
    db.respondTo('students.select', { data: { id: ID(30), user: { isActive: false } } }, { data: null }, { data: { id: ID(30), user: { isActive: true } } });
    db.respondTo('classes.select', { data: null });
    expect((await create({ studentId: ID(30), classId: ID(40) })).status).toBe(422);
    expect((await create({ studentId: ID(30), classId: ID(40) })).status).toBe(422);
    const unknownClass = await create({ studentId: ID(30), classId: ID(40) });
    expect([unknownClass.status, unknownClass.body.error?.details]).toEqual([422, [{ path: 'classId', message: 'Class not found.' }]]);
    expect(db.callsTo('studentEnrollments', 'insert')).toHaveLength(0);
  });

  it('only moves a student to a class in the same academic year', async () => {
    const move = (classId: string) => callRoute(enrollment.PATCH, { method: 'PATCH', params: { id: ID(60) }, body: { classId } });
    db.respondTo('studentEnrollments.select', { data: { academicYearId: ID(50) } });
    db.respondTo('classes.select', { data: { id: ID(41), academicYearId: ID(51) } }, { data: { id: ID(42), academicYearId: ID(50) } });
    db.respondTo('studentEnrollments.update', { data: { id: ID(60) } });
    expect((await move(ID(41))).status).toBe(422);
    expect(db.callsTo('studentEnrollments', 'update')).toHaveLength(0);

    expect((await move(ID(42))).status).toBe(200);
    expect(db.callsTo('studentEnrollments', 'update')[0].payload).toEqual({ classId: ID(42) });
  });

  it("a student filtering by another student's id gets an explicit ownership check", async () => {
    actAs(studentUser);
    await callRoute(enrollments.GET, { path: `/api/enrollments?studentId=${ID(31)}` });
    expect(requireStudentOwnership).toHaveBeenCalledWith(db.client, ID(31));
  });
});

describe('teacher assignments', () => {
  it('refuses a deactivated teacher before writing', async () => {
    db.respondTo('teachers.select', { data: { id: ID(20), user: { isActive: false } } });
    const result = await callRoute(assignments.POST, { body: { teacherId: ID(20), classId: ID(40), subjectId: ID(70) } });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'teacherId', message: "The teacher's account is deactivated." }]]);
    expect(db.callsTo('teacherAssignments', 'insert')).toHaveLength(0);
  });
});

describe('list ordering ends with a unique column (stable pagination)', () => {
  it.each([
    ['teachers', teachers.GET, 'teachers', 'employeeCode'],
    ['students', students.GET, 'students', 'admissionNumber'],
    ['enrollments', enrollments.GET, 'studentEnrollments', 'id'],
    ['teacher assignments', assignments.GET, 'teacherAssignments', 'id'],
  ])('%s', async (_name, handler, table, uniqueColumn) => {
    await callRoute(handler);
    expect(db.callsTo(table as string, 'select')[0].orders.at(-1)).toBe(uniqueColumn);
  });
});
