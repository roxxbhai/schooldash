import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE STUDENT AND TEACHER ATTENDANCE ROUTES: REAL HANDLERS, A
// RECORDING FAKE DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
  findTeacherIdByUserId: vi.fn(),
  teachesClass: vi.fn(),
  requireStudentOwnership: vi.fn(async () => ({ success: true, message: '', data: null })),
}));

import * as studentAttendance from '@/app/api/student-attendance/route';
import * as studentAttendanceBulk from '@/app/api/student-attendance/bulk/route';
import * as studentAttendanceRecord from '@/app/api/student-attendance/[id]/route';
import * as teacherAttendance from '@/app/api/teacher-attendance/route';
import { findTeacherIdByUserId, requireStudentOwnership, teachesClass } from '@/functions/authorization';
import { attendanceDateSchema, latestAttendanceDate } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { okResult } from '../helpers/function-result';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = makeUser('ADMIN', ID(1));
const teacher = makeUser('TEACHER', ID(2));
const student = makeUser('STUDENT', ID(3));
const CLASS = ID(40);
const S1 = ID(31);
const S2 = ID(32);
let db: ReturnType<typeof fakeDb>;

/** THE CLASS, ITS YEAR, AND TWO ACTIVE, ENROLLED STUDENTS — UNLESS A TEST SAYS OTHERWISE. */
function seedValidSchool(overrides: { classRow?: unknown; students?: unknown[]; enrolled?: string[] } = {}) {
  db.respondTo('classes.select', { data: 'classRow' in overrides ? overrides.classRow : { id: CLASS, academicYear: { startDate: '2015-04-01', endDate: '2016-03-31' } } });
  db.respondTo('students.select', { data: overrides.students ?? [{ id: S1, user: { isActive: true } }, { id: S2, user: { isActive: true } }] });
  db.respondTo('studentEnrollments.select', { data: (overrides.enrolled ?? [S1, S2]).map((studentId) => ({ studentId })) });
  db.respondTo('studentAttendance.insert', { data: [{ id: ID(60) }, { id: ID(61) }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

const input = { studentId: S1, classId: CLASS, attendanceDate: '2015-06-01', status: 'present' };
const record = (body: object) => callRoute(studentAttendance.POST, { body });

describe('attendance validation', () => {
  it('uses exactly the database statuses', async () => {
    seedValidSchool();
    expect((await record({ ...input, status: 'late' })).status).toBe(201);
    for (const status of ['PRESENT', 'holiday', '']) expect((await record({ ...input, status })).status, status).toBe(422);
  });

  it('rejects future and invalid dates; allows up to one day ahead of UTC', () => {
    expect(latestAttendanceDate(new Date('2026-10-15T23:00:00Z'))).toBe('2026-10-16');
    expect(attendanceDateSchema.safeParse('2999-01-01').success).toBe(false);
    expect(attendanceDateSchema.safeParse('2015-02-30').success).toBe(false);
    expect(attendanceDateSchema.safeParse(latestAttendanceDate()).success).toBe(true);
  });

  it('rejects client-supplied markedByUserId', async () => {
    expect((await record({ ...input, markedByUserId: ID(9) })).status).toBe(422);
  });

  it('validates date filters', async () => {
    const list = (query: string) => callRoute(studentAttendance.GET, { path: `/api/student-attendance?${query}` });
    expect((await list('date=2015-06-01&from=2015-06-01')).status).toBe(400);
    expect((await list('from=2015-06-02&to=2015-06-01')).status).toBe(400);
    expect((await list('from=2015-06-01&to=2015-06-30&status=absent')).status).toBe(200);
  });

  it('bulk submissions: 1–200 records, no duplicate students', async () => {
    const bulk = (records: unknown[]) => callRoute(studentAttendanceBulk.POST, { body: { classId: CLASS, attendanceDate: '2015-06-01', records } });
    expect((await bulk([])).status).toBe(422);
    const duplicate = await bulk([{ studentId: S1, status: 'present' }, { studentId: S1, status: 'absent' }]);
    expect(duplicate.body.error?.details?.[0].path).toBe('records.1.studentId');
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ studentId: ID(1000 + i), status: 'present' }));
    expect((await bulk(tooMany)).status).toBe(422);
  });
});

describe('recording student attendance', () => {
  it('records the acting user as marker', async () => {
    seedValidSchool();
    await record(input);
    expect(db.callsTo('studentAttendance', 'insert')[0].payload).toEqual([{ ...input, markedByUserId: admin.id }]);
  });

  it("refuses a teacher who doesn't teach the class, before validating or writing", async () => {
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(false));
    expect((await record(input)).status).toBe(403);
    expect(teachesClass).toHaveBeenCalledWith(db.client, teacher, { classId: CLASS });
    expect(db.callsTo('classes')).toHaveLength(0);
    expect(db.callsTo('studentAttendance', 'insert')).toHaveLength(0);
  });

  it('allows a teacher of the class', async () => {
    seedValidSchool();
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(true));
    expect((await record(input)).status).toBe(201);
    expect(db.callsTo('studentAttendance', 'insert')).toHaveLength(1);
  });

  it('refuses students outright', async () => {
    actAs(student);
    expect((await record(input)).status).toBe(403);
  });

  it.each([
    ['an unknown class', { classRow: null }, 'classId', 'Class not found.', '2015-06-01'],
    ['a date outside the academic year', {}, 'attendanceDate', "The date is outside the class's academic year.", '2016-06-01'],
    ['an unknown student', { students: [] }, 'studentId', 'Student not found.', '2015-06-01'],
    ['a deactivated student', { students: [{ id: S1, user: { isActive: false } }] }, 'studentId', "The student's account is deactivated.", '2015-06-01'],
    ['a student not enrolled in the class', { enrolled: [] }, 'studentId', 'The student is not enrolled in this class.', '2015-06-01'],
  ])('rejects %s (422) without writing', async (_label, overrides, path, message, date) => {
    seedValidSchool(overrides);
    const result = await record({ ...input, attendanceDate: date });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path, message }]]);
    expect(db.callsTo('studentAttendance', 'insert')).toHaveLength(0);
  });
});

describe('bulk class attendance', () => {
  const submission = {
    classId: CLASS,
    attendanceDate: '2015-06-01',
    records: [
      { studentId: S1, status: 'present' },
      { studentId: S2, status: 'absent', remarks: 'sick' },
    ],
  };

  it('inserts every record in one statement, marked by the actor', async () => {
    seedValidSchool();
    const result = await callRoute(studentAttendanceBulk.POST, { body: submission });
    expect(db.callsTo('studentAttendance', 'insert')).toHaveLength(1);
    expect(db.callsTo('studentAttendance', 'insert')[0].payload).toEqual([
      { studentId: S1, status: 'present', classId: CLASS, attendanceDate: '2015-06-01', markedByUserId: admin.id },
      { studentId: S2, status: 'absent', remarks: 'sick', classId: CLASS, attendanceDate: '2015-06-01', markedByUserId: admin.id },
    ]);
    expect(result.body.data.count).toBe(2);
  });

  it('reports every invalid record by index and writes nothing', async () => {
    seedValidSchool({ enrolled: [S1] });
    const result = await callRoute(studentAttendanceBulk.POST, { body: submission });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'records.1.studentId', message: 'The student is not enrolled in this class.' }]]);
    expect(db.callsTo('studentAttendance', 'insert')).toHaveLength(0);
  });
});

describe('correcting student attendance', () => {
  const correct = (body: object) => callRoute(studentAttendanceRecord.PATCH, { method: 'PATCH', params: { id: ID(60) }, body });

  it("authorizes against the record's own class and records the editor", async () => {
    db.respondTo('studentAttendance.select', { data: { id: ID(60), classId: CLASS } });
    db.respondTo('studentAttendance.update', { data: { id: ID(60) } });
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(false));
    expect((await correct({ status: 'late' })).status).toBe(403);
    expect(teachesClass).toHaveBeenCalledWith(db.client, teacher, { classId: CLASS });
    expect(db.callsTo('studentAttendance', 'update')).toHaveLength(0);

    actAs(admin);
    expect((await correct({ status: 'late', remarks: null })).status).toBe(200);
    expect(db.callsTo('studentAttendance', 'update')[0].payload).toEqual({ status: 'late', remarks: null, markedByUserId: admin.id });
  });

  it('rejects an empty correction', async () => {
    expect((await correct({})).status).toBe(422);
  });
});

describe('reading attendance', () => {
  it("a student asking for another student's attendance gets an ownership check", async () => {
    actAs(student);
    await callRoute(studentAttendance.GET, { path: `/api/student-attendance?studentId=${S2}` });
    expect(requireStudentOwnership).toHaveBeenCalledWith(db.client, S2);
  });

  it("a teacher asking for another teacher's attendance gets 403", async () => {
    actAs(teacher);
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(okResult(ID(20)));
    const list = (teacherId: string) => callRoute(teacherAttendance.GET, { path: `/api/teacher-attendance?teacherId=${teacherId}` });
    expect((await list(ID(21))).status).toBe(403);
    expect((await list(ID(20))).status).toBe(200);
  });
});

describe('recording teacher attendance', () => {
  const recordTeacher = (status: string) => callRoute(teacherAttendance.POST, { body: { teacherId: ID(20), attendanceDate: '2015-06-01', status } });

  it('rejects a deactivated teacher before writing', async () => {
    db.respondTo('teachers.select', { data: { id: ID(20), user: { isActive: false } } });
    expect((await recordTeacher('present')).status).toBe(422);
    expect(db.callsTo('teacherAttendance', 'insert')).toHaveLength(0);
  });

  it('records the acting admin as marker', async () => {
    db.respondTo('teachers.select', { data: { id: ID(20), user: { isActive: true } } });
    db.respondTo('teacherAttendance.insert', { data: [{ id: ID(70) }] });
    expect((await recordTeacher('leave')).status).toBe(201);
    expect(db.callsTo('teacherAttendance', 'insert')[0].payload).toEqual({
      teacherId: ID(20),
      attendanceDate: '2015-06-01',
      status: 'leave',
      markedByUserId: admin.id,
    });
  });
});

describe('list ordering ends with a unique column (stable pagination)', () => {
  it.each([
    ['student attendance', studentAttendance.GET, 'studentAttendance'],
    ['teacher attendance', teacherAttendance.GET, 'teacherAttendance'],
  ])('%s', async (_name, handler, table) => {
    await callRoute(handler);
    expect(db.callsTo(table, 'select')[0].orders.at(-1)).toBe('id');
  });
});
