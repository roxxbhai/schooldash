import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for student and teacher attendance (Phase 4B/4C).
 * Route Handlers run in-process against the real project; only Next's cookie
 * store is simulated. All records are unique to this run and removed after.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as sa from '@/app/api/student-attendance/route';
import * as saBulk from '@/app/api/student-attendance/bulk/route';
import * as saOne from '@/app/api/student-attendance/[id]/route';
import * as ta from '@/app/api/teacher-attendance/route';
import * as taOne from '@/app/api/teacher-attendance/[id]/route';
import { ensureItAdmin, ensureItTeacher, provisionTestAccount, runId, teardown, testCode, testSubjectName, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { APP, anonymous, call, signIn, type ApiResult } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';
const D1 = '2023-06-01';
const D2 = '2023-06-02';
const D3 = '2023-06-03';

let db: pg.Client;
let itAdmin: TestAccount;
let itTeacher: TestAccount; // t1: persistent, because it performs audited corrections
const acc = {} as Record<'t1' | 't2' | 't3' | 's1' | 's2' | 's3' | 's4' | 's5' | 'a2', TestAccount>;
const sid = {} as Record<'s1' | 's2' | 's3' | 's4' | 's5', string>;
const tid = {} as Record<'t1' | 't2' | 't3', string>;
const ses = {} as Record<'admin' | 't1' | 't2' | 's1' | 's2' | 'deactivatedAdmin', CookieStore>;
let classA: string;
let classB: string;
let attendanceS1D1: string;
let teacherRecordT1: string;
let teacherRecordT2: string;

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);
const ids = (result: ApiResult) => result.body.data.items.map((item: { id: string }) => item.id);
const count = async (sql: string, params: unknown[]) => Number((await db.query(sql, params)).rows[0].count);

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();

  itTeacher = await ensureItTeacher();
  acc.t1 = itTeacher;
  tid.t1 = (await db.query('select id from public.teachers where "userId" = $1', [itTeacher.userId])).rows[0].id;
  for (const n of ['t2', 't3'] as const) {
    acc[n] = await provisionTestAccount(`att-${n}`, { role: 'TEACHER', profile: {} });
    tid[n] = (await db.query('select id from public.teachers where "userId" = $1', [acc[n].userId])).rows[0].id;
  }
  for (const n of ['s1', 's2', 's3', 's4', 's5'] as const) {
    acc[n] = await provisionTestAccount(`att-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`att-${n}`) } });
    sid[n] = (await db.query('select id from public.students where "userId" = $1', [acc[n].userId])).rows[0].id;
  }
  acc.a2 = await provisionTestAccount('att-a2', { role: 'ADMIN' });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const yearId = await one(
    'insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id',
    [`IT ${runId} attendance`],
  );
  track('academicYears', yearId);
  classA = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'8\', \'A\') returning id', [yearId]);
  classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'8\', \'B\') returning id', [yearId]);
  track('classes', classA);
  track('classes', classB);
  const subjectId = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('att-sub'), testSubjectName('att')]);
  track('subjects', subjectId);
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [tid.t1, classA, subjectId]));
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [tid.t2, classB, subjectId]));
  for (const [s, c] of [['s1', classA], ['s2', classA], ['s4', classA], ['s3', classB]] as const) {
    track('studentEnrollments', await one(
      'insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id',
      [sid[s], c, yearId],
    ));
  }

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  ses.t1 = await signIn(harness, acc.t1.email, acc.t1.password);
  ses.t2 = await signIn(harness, acc.t2.email, acc.t2.password);
  ses.s1 = await signIn(harness, acc.s1.email, acc.s1.password);
  ses.s2 = await signIn(harness, acc.s2.email, acc.s2.password);
  ses.deactivatedAdmin = await signIn(harness, acc.a2.email, acc.a2.password);

  for (const userId of [acc.s4.userId, acc.t3.userId, acc.a2.userId]) {
    await db.query('select public."setAppUserStatus"($1, false, null)', [userId]);
  }
});

afterAll(async () => {
  await teardown(itAdmin, itTeacher);
  await db?.end();
});

// ---------------------------------------------------------------------------------
// Student attendance
// ---------------------------------------------------------------------------------

describe('student attendance: recording', () => {
  const body = (overrides: Record<string, unknown> = {}) => ({ studentId: sid.s1, classId: classA, attendanceDate: D1, status: 'present', ...overrides });

  it('a teacher of the class records attendance; the marker is the teacher (201)', async () => {
    const result = await api(ses.t1, sa.POST, 'POST', '/api/student-attendance', { body: body() });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ studentId: sid.s1, classId: classA, attendanceDate: D1, status: 'present', markedByUserId: acc.t1.userId });
    attendanceS1D1 = result.body.data.id;
  });

  it('rejects a second record for the same student and date (409)', async () => {
    const result = await api(ses.admin, sa.POST, 'POST', '/api/student-attendance', { body: body({ status: 'absent' }) });
    expect([result.status, result.body.error?.message]).toEqual([409, 'Attendance for this student on this date already exists.']);
  });

  it("a teacher cannot record attendance for a class they don't teach (403)", async () => {
    const other = await api(ses.t1, sa.POST, 'POST', '/api/student-attendance', { body: body({ studentId: sid.s3, classId: classB }) });
    expect(other.status).toBe(403);
    const reverse = await api(ses.t2, sa.POST, 'POST', '/api/student-attendance', { body: body({ attendanceDate: D2 }) });
    expect(reverse.status).toBe(403);
  });

  it('students cannot record attendance, not even their own (403 / 42501)', async () => {
    expect((await api(ses.s1, sa.POST, 'POST', '/api/student-attendance', { body: body({ attendanceDate: D3 }) })).status).toBe(403);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: acc.s1.email, password: acc.s1.password });
    const { error } = await client.from('studentAttendance').insert({ studentId: sid.s1, classId: classA, attendanceDate: D3, status: 'present', markedByUserId: acc.s1.userId });
    expect(error?.code).toBe('42501');
  });

  // Overrides are functions: fixture ids only exist after beforeAll.
  it.each([
    ['an invalid status', () => ({ status: 'holiday' }), 'status'],
    ['a future date', () => ({ attendanceDate: '2999-01-01' }), 'attendanceDate'],
    ['an invalid date', () => ({ attendanceDate: '2023-02-30' }), 'attendanceDate'],
    ["a date outside the class's academic year", () => ({ attendanceDate: '2022-06-01' }), 'attendanceDate'],
    ['a student not enrolled anywhere', () => ({ studentId: sid.s5, attendanceDate: D3 }), 'studentId'],
    ['a student enrolled in another class', () => ({ studentId: sid.s3, attendanceDate: D3 }), 'studentId'],
    ['a nonexistent student', () => ({ studentId: MISSING, attendanceDate: D3 }), 'studentId'],
    ['a nonexistent class', () => ({ classId: MISSING, attendanceDate: D3 }), 'classId'],
    ['a deactivated student', () => ({ studentId: sid.s4, attendanceDate: D3 }), 'studentId'],
    ['a client-supplied markedByUserId', () => ({ markedByUserId: acc.t2.userId, attendanceDate: D3 }), ''],
  ])('rejects %s (422) and writes nothing', async (_label, overrides, path) => {
    const before = await count('select count(*) from public."studentAttendance" where "classId" = $1', [classA]);
    const result = await api(ses.admin, sa.POST, 'POST', '/api/student-attendance', { body: body(overrides()) });
    expect([result.status, result.body.error?.code]).toEqual([422, 'VALIDATION_ERROR']);
    expect(result.body.error?.details?.[0]?.path).toBe(path);
    expect(await count('select count(*) from public."studentAttendance" where "classId" = $1', [classA])).toBe(before);
  });

  it('the database rejects a future date even when the API is bypassed', async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: acc.t1.email, password: acc.t1.password });
    const { error } = await client.from('studentAttendance').insert({ studentId: sid.s2, classId: classA, attendanceDate: '2999-01-01', status: 'present', markedByUserId: acc.t1.userId });
    expect(error?.code).toBe('23514');
  });
});

describe('student attendance: bulk class submission', () => {
  it('records a whole class in one all-or-nothing request (201)', async () => {
    const result = await api(ses.t1, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D2, records: [{ studentId: sid.s1, status: 'present' }, { studentId: sid.s2, status: 'absent', remarks: 'sick' }] },
    });
    expect(result.status).toBe(201);
    expect(result.body.data.count).toBe(2);
    expect(result.body.data.items.every((r: { markedByUserId: string }) => r.markedByUserId === acc.t1.userId)).toBe(true);
  });

  it('resubmitting the same day is 409 and changes nothing', async () => {
    const result = await api(ses.t1, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D2, records: [{ studentId: sid.s1, status: 'late' }] },
    });
    expect(result.status).toBe(409);
    expect((await db.query('select status from public."studentAttendance" where "studentId" = $1 and "attendanceDate" = $2', [sid.s1, D2])).rows[0].status).toBe('present');
  });

  it('one invalid record rejects the whole submission, naming it by index; nothing is written', async () => {
    const result = await api(ses.admin, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D3, records: [{ studentId: sid.s1, status: 'present' }, { studentId: sid.s3, status: 'present' }] },
    });
    expect(result.status).toBe(422);
    expect(result.body.error?.details).toEqual([{ path: 'records.1.studentId', message: 'The student is not enrolled in this class.' }]);
    expect(await count('select count(*) from public."studentAttendance" where "classId" = $1 and "attendanceDate" = $2', [classA, D3])).toBe(0);
  });

  it('a partially-duplicate submission is rejected atomically (409, no rows from it saved)', async () => {
    const result = await api(ses.admin, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D1, records: [{ studentId: sid.s2, status: 'present' }, { studentId: sid.s1, status: 'present' }] },
    });
    expect(result.status).toBe(409);
    expect(await count('select count(*) from public."studentAttendance" where "studentId" = $1 and "attendanceDate" = $2', [sid.s2, D1])).toBe(0);
  });

  it('rejects duplicate students within a submission and teachers of other classes', async () => {
    const dup = await api(ses.t1, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D3, records: [{ studentId: sid.s1, status: 'present' }, { studentId: sid.s1, status: 'absent' }] },
    });
    expect(dup.status).toBe(422);
    const other = await api(ses.t2, saBulk.POST, 'POST', '/api/student-attendance/bulk', {
      body: { classId: classA, attendanceDate: D3, records: [{ studentId: sid.s1, status: 'present' }] },
    });
    expect(other.status).toBe(403);
  });
});

describe('student attendance: reading', () => {
  it('each role sees exactly what it may', async () => {
    expect((await api(ses.s1, saOne.GET, 'GET', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 } })).status).toBe(200);
    expect((await api(ses.s2, saOne.GET, 'GET', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 } })).status).toBe(404);
    expect((await api(ses.t2, saOne.GET, 'GET', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 } })).status).toBe(404);
    expect((await api(ses.t1, saOne.GET, 'GET', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 } })).status).toBe(200);
  });

  it('lists by class and date for teachers and admins; other classes are invisible to a teacher', async () => {
    const byDay = await api(ses.t1, sa.GET, 'GET', `/api/student-attendance?classId=${classA}&date=${D2}`);
    expect(byDay.body.data.items.map((r: { studentId: string }) => r.studentId).sort()).toEqual([sid.s1, sid.s2].sort());
    expect((await api(ses.t2, sa.GET, 'GET', `/api/student-attendance?classId=${classA}`)).body.data.items).toEqual([]);
    expect((await api(ses.admin, sa.GET, 'GET', `/api/student-attendance?classId=${classA}&status=absent`)).body.data.items.map((r: { studentId: string }) => r.studentId)).toEqual([sid.s2]);
  });

  it('a student sees only their own history; asking for another student is 403', async () => {
    const mine = await api(ses.s1, sa.GET, 'GET', `/api/student-attendance?from=${D1}&to=${D3}`);
    expect(new Set(mine.body.data.items.map((r: { studentId: string }) => r.studentId))).toEqual(new Set([sid.s1]));
    expect(mine.body.data.items.map((r: { attendanceDate: string }) => r.attendanceDate)).toEqual([D2, D1]);
    expect((await api(ses.s1, sa.GET, 'GET', `/api/student-attendance?studentId=${sid.s2}`)).status).toBe(403);
  });

  it('paginates in a stable order', async () => {
    const first = await api(ses.admin, sa.GET, 'GET', `/api/student-attendance?classId=${classA}&limit=1&page=1`);
    const second = await api(ses.admin, sa.GET, 'GET', `/api/student-attendance?classId=${classA}&limit=1&page=2`);
    expect(first.body.data.pagination).toMatchObject({ limit: 1, total: 3, totalPages: 3 });
    expect(ids(first)).not.toEqual(ids(second));
  });

  it('rejects invalid filters (400)', async () => {
    for (const query of ['date=2023-06-01&from=2023-06-01', 'from=2023-06-05&to=2023-06-01', 'status=PRESENT', 'classId=x']) {
      expect((await api(ses.admin, sa.GET, 'GET', `/api/student-attendance?${query}`)).status, query).toBe(400);
    }
  });
});

describe('student attendance: corrections', () => {
  it('a teacher of the class corrects status/remarks; the editor is recorded and audited', async () => {
    const result = await api(ses.t1, saOne.PATCH, 'PATCH', `/api/student-attendance/${attendanceS1D1}`, {
      params: { id: attendanceS1D1 },
      body: { status: 'late', remarks: 'bus delayed' },
    });
    expect(result.body.data).toMatchObject({ status: 'late', remarks: 'bus delayed', markedByUserId: acc.t1.userId });
    const { rows } = await db.query(
      'select "actorUserId", "oldData"->>\'status\' as before, "newData"->>\'status\' as after from public."auditLogs" where "entityId" = $1 and action = \'studentAttendance.update\'',
      [attendanceS1D1],
    );
    expect(rows).toEqual([{ actorUserId: acc.t1.userId, before: 'present', after: 'late' }]);
  });

  it('identity fields cannot be changed (422), and empty corrections are refused (422)', async () => {
    for (const bodyPatch of [{ studentId: sid.s2 }, { attendanceDate: D3 }, { classId: classB }, {}]) {
      const result = await api(ses.admin, saOne.PATCH, 'PATCH', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 }, body: bodyPatch });
      expect(result.status, JSON.stringify(bodyPatch)).toBe(422);
    }
  });

  it('teachers of other classes and students cannot correct (404 / 403)', async () => {
    expect((await api(ses.t2, saOne.PATCH, 'PATCH', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 }, body: { status: 'absent' } })).status).toBe(404);
    expect((await api(ses.s1, saOne.PATCH, 'PATCH', `/api/student-attendance/${attendanceS1D1}`, { params: { id: attendanceS1D1 }, body: { status: 'present' } })).status).toBe(403);
  });

  it('history is preserved when a student is deactivated', async () => {
    await db.query('select public."setAppUserStatus"($1, false, null)', [acc.s2.userId]);
    const records = await api(ses.admin, sa.GET, 'GET', `/api/student-attendance?studentId=${sid.s2}`);
    expect(records.body.data.items).toHaveLength(1);
    const blocked = await api(ses.admin, sa.POST, 'POST', '/api/student-attendance', {
      body: { studentId: sid.s2, classId: classA, attendanceDate: D3, status: 'present' },
    });
    expect(blocked.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------------
// Teacher attendance
// ---------------------------------------------------------------------------------

describe('teacher attendance', () => {
  it('an admin records attendance; the marker is the admin (201)', async () => {
    const one = await api(ses.admin, ta.POST, 'POST', '/api/teacher-attendance', { body: { teacherId: tid.t1, attendanceDate: D1, status: 'present' } });
    expect(one.status).toBe(201);
    expect(one.body.data).toMatchObject({ teacherId: tid.t1, markedByUserId: itAdmin.userId });
    teacherRecordT1 = one.body.data.id;
    track('teacherAttendance', teacherRecordT1); // about the persistent teacher: not covered by account cleanup
    const two = await api(ses.admin, ta.POST, 'POST', '/api/teacher-attendance', { body: { teacherId: tid.t2, attendanceDate: D1, status: 'leave' } });
    teacherRecordT2 = two.body.data.id;
  });

  it.each([
    ['a duplicate day', () => ({ teacherId: tid.t1, attendanceDate: D1, status: 'present' }), 409],
    ['a deactivated teacher', () => ({ teacherId: tid.t3, attendanceDate: D1, status: 'present' }), 422],
    ['a nonexistent teacher', () => ({ teacherId: MISSING, attendanceDate: D1, status: 'present' }), 422],
    ['a future date', () => ({ teacherId: tid.t1, attendanceDate: '2999-01-01', status: 'present' }), 422],
    ['an invalid status', () => ({ teacherId: tid.t1, attendanceDate: D2, status: 'PRESENT' }), 422],
  ])('rejects %s', async (_label, input, status) => {
    const result = await api(ses.admin, ta.POST, 'POST', '/api/teacher-attendance', { body: input() });
    expect(result.status).toBe(status);
  });

  it('teachers cannot record or correct attendance — even their own (403)', async () => {
    expect((await api(ses.t1, ta.POST, 'POST', '/api/teacher-attendance', { body: { teacherId: tid.t1, attendanceDate: D2, status: 'present' } })).status).toBe(403);
    expect((await api(ses.t1, taOne.PATCH, 'PATCH', `/api/teacher-attendance/${teacherRecordT1}`, { params: { id: teacherRecordT1 }, body: { status: 'late' } })).status).toBe(403);
  });

  it('a teacher sees only their own records', async () => {
    const own = await api(ses.t1, ta.GET, 'GET', `/api/teacher-attendance?from=${D1}&to=${D1}`);
    expect(ids(own)).toEqual([teacherRecordT1]);
    expect((await api(ses.t1, ta.GET, 'GET', `/api/teacher-attendance?teacherId=${tid.t2}`)).status).toBe(403);
    expect((await api(ses.t1, taOne.GET, 'GET', `/api/teacher-attendance/${teacherRecordT2}`, { params: { id: teacherRecordT2 } })).status).toBe(404);
    expect((await api(ses.t1, taOne.GET, 'GET', `/api/teacher-attendance/${teacherRecordT1}`, { params: { id: teacherRecordT1 } })).status).toBe(200);
  });

  it('students and anonymous users have no access', async () => {
    expect((await api(ses.s1, ta.GET, 'GET', '/api/teacher-attendance')).status).toBe(403);
    expect((await api(ses.s1, taOne.GET, 'GET', `/api/teacher-attendance/${teacherRecordT1}`, { params: { id: teacherRecordT1 } })).status).toBe(403);
    expect((await api(anonymous(), ta.GET, 'GET', '/api/teacher-attendance')).status).toBe(401);
  });

  it('admins list with filters and correct records (audited)', async () => {
    const leave = await api(ses.admin, ta.GET, 'GET', `/api/teacher-attendance?date=${D1}&status=leave`);
    expect(ids(leave)).toContain(teacherRecordT2);
    expect(ids(leave)).not.toContain(teacherRecordT1);

    const corrected = await api(ses.admin, taOne.PATCH, 'PATCH', `/api/teacher-attendance/${teacherRecordT1}`, {
      params: { id: teacherRecordT1 },
      body: { status: 'late', remarks: 'traffic' },
    });
    expect(corrected.body.data).toMatchObject({ status: 'late', remarks: 'traffic', markedByUserId: itAdmin.userId });
    expect(await count('select count(*) from public."auditLogs" where "entityId" = $1 and action = \'teacherAttendance.update\'', [teacherRecordT1])).toBe(1);
    expect((await api(ses.admin, taOne.PATCH, 'PATCH', `/api/teacher-attendance/${teacherRecordT1}`, { params: { id: teacherRecordT1 }, body: { teacherId: tid.t2 } })).status).toBe(422);
  });
});

// ---------------------------------------------------------------------------------
// Matrix: generic checks for every attendance endpoint
// ---------------------------------------------------------------------------------

type Role = 'admin' | 't1' | 's1';
interface Endpoint {
  name: string;
  handler: unknown;
  method: string;
  path: (id: string) => string;
  id?: () => string;
  body?: () => Record<string, unknown>;
  forbidden: Role[];
  list?: boolean;
}

const endpoints: Endpoint[] = [
  { name: 'GET /student-attendance', handler: sa.GET, method: 'GET', path: () => '/api/student-attendance', forbidden: [], list: true },
  { name: 'POST /student-attendance', handler: sa.POST, method: 'POST', path: () => '/api/student-attendance', forbidden: ['s1'], body: () => ({ studentId: sid.s1, classId: classA, attendanceDate: D3, status: 'present' }) },
  { name: 'POST /student-attendance/bulk', handler: saBulk.POST, method: 'POST', path: () => '/api/student-attendance/bulk', forbidden: ['s1'], body: () => ({ classId: classA, attendanceDate: D3, records: [{ studentId: sid.s1, status: 'present' }] }) },
  { name: 'GET /student-attendance/{id}', handler: saOne.GET, method: 'GET', path: (id) => `/api/student-attendance/${id}`, id: () => attendanceS1D1, forbidden: [] },
  { name: 'PATCH /student-attendance/{id}', handler: saOne.PATCH, method: 'PATCH', path: (id) => `/api/student-attendance/${id}`, id: () => attendanceS1D1, forbidden: ['s1'], body: () => ({ status: 'present' }) },
  { name: 'GET /teacher-attendance', handler: ta.GET, method: 'GET', path: () => '/api/teacher-attendance', forbidden: ['s1'], list: true },
  { name: 'POST /teacher-attendance', handler: ta.POST, method: 'POST', path: () => '/api/teacher-attendance', forbidden: ['t1', 's1'], body: () => ({ teacherId: tid.t1, attendanceDate: D3, status: 'present' }) },
  { name: 'GET /teacher-attendance/{id}', handler: taOne.GET, method: 'GET', path: (id) => `/api/teacher-attendance/${id}`, id: () => teacherRecordT1, forbidden: ['s1'] },
  { name: 'PATCH /teacher-attendance/{id}', handler: taOne.PATCH, method: 'PATCH', path: (id) => `/api/teacher-attendance/${id}`, id: () => teacherRecordT1, forbidden: ['t1', 's1'], body: () => ({ status: 'present' }) },
];

describe.each(endpoints)('matrix: $name', (e) => {
  const send = (as: CookieStore, overrides: { id?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const id = overrides.id ?? e.id?.() ?? '';
    return api(as, e.handler, e.method, e.path(id), {
      params: e.id ? { id } : {},
      body: 'body' in overrides ? overrides.body : e.body?.(),
      headers: overrides.headers,
    });
  };

  it("401 without a session or with a deactivated admin's session", async () => {
    expect((await send(anonymous())).status).toBe(401);
    expect((await send(ses.deactivatedAdmin)).status).toBe(401);
  });

  it('403 for forbidden roles', async () => {
    for (const role of e.forbidden) expect((await send(ses[role])).status, role).toBe(403);
  });

  if (e.method !== 'GET') {
    it('rejects cross-site requests', async () => {
      expect((await send(ses.admin, { headers: { origin: 'https://evil.example' } })).body.error?.code).toBe('CSRF_REJECTED');
    });
  }

  if (e.id) {
    it('400 for a malformed id, 404 for a missing one', async () => {
      expect((await send(ses.admin, { id: 'nope' })).status).toBe(400);
      expect((await send(ses.admin, { id: MISSING })).status).toBe(404);
    });
  }

  if (e.body) {
    it('400 for malformed JSON; 422 for unknown fields and empty bodies', async () => {
      harness.state.cookies = ses.admin;
      const id = e.id?.() ?? '';
      const response = await (e.handler as (r: Request, c: unknown) => Promise<Response>)(
        new Request(`${APP}${e.path(id)}`, { method: e.method, headers: { origin: APP, 'content-type': 'application/json' }, body: '{nope' }),
        { params: Promise.resolve(e.id ? { id } : {}) },
      );
      expect(response.status).toBe(400);
      expect((await send(ses.admin, { body: { ...e.body!(), extra: 1 } })).status).toBe(422);
      expect((await send(ses.admin, { body: {} })).status).toBe(422);
    });
  }

  if (e.list) {
    it('returns a paginated envelope; invalid pagination is 400', async () => {
      const ok = await api(ses.admin, e.handler, 'GET', `${e.path('')}?limit=2`);
      expect(Object.keys(ok.body.data).sort()).toEqual(['items', 'pagination']);
      for (const query of ['limit=0', 'limit=101', 'page=x']) {
        expect((await api(ses.admin, e.handler, 'GET', `${e.path('')}?${query}`)).status, query).toBe(400);
      }
    });
  }
});
