import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for the timetable (Phase 6B). Route Handlers run
 * in-process against the real project with real sessions, so route guards,
 * RLS, column grants, triggers and the exclusion constraints are all
 * exercised. Fixtures are created as the database owner and tracked for
 * cleanup; only the integration admin performs (audited) writes.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as collection from '@/app/api/timetable-entries/route';
import * as single from '@/app/api/timetable-entries/[id]/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, testSubjectName, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';
const CLASS_CONFLICT = 'The class already has a period that overlaps this time.';
const TEACHER_CONFLICT = 'The teacher already has a period that overlaps this time.';

let db: pg.Client;
let itAdmin: TestAccount;
const acc = {} as Record<'t1' | 't2' | 'tOff' | 's1' | 's2', TestAccount>;
const ses = {} as Record<'admin' | 't1' | 't2' | 's1' | 's2', CookieStore>;
const f = {} as {
  year: string; otherYear: string; classA: string; classB: string; classC: string;
  maths: string; science: string; t1: string; t2: string; tOff: string;
};

type Body = Record<string, unknown>;
const create = (as: CookieStore, body: Body) => call(harness, as, collection.POST, 'POST', '/api/timetable-entries', { body });
const list = (as: CookieStore, query = '') => call(harness, as, collection.GET, 'GET', `/api/timetable-entries?limit=100&${query}`);
const get = (as: CookieStore, id: string) => call(harness, as, single.GET, 'GET', `/api/timetable-entries/${id}`, { params: { id } });
const patch = (as: CookieStore, id: string, body: Body) => call(harness, as, single.PATCH, 'PATCH', `/api/timetable-entries/${id}`, { body, params: { id } });
const remove = (as: CookieStore, id: string) => call(harness, as, single.DELETE, 'DELETE', `/api/timetable-entries/${id}`, { params: { id } });

/** Creates an entry as admin, asserts 201 and tracks it. */
async function entry(body: Body): Promise<string> {
  const result = await create(ses.admin, body);
  expect(result.status, JSON.stringify(result.body.error)).toBe(201);
  track('timetableEntries', result.body.data.id);
  return result.body.data.id;
}

const idsIn = (result: { body: { data: { items: { id: string }[] } } }, scope: Set<string>) =>
  result.body.data.items.map((row) => row.id).filter((id) => scope.has(id)).sort();
const created = new Set<string>();
const remember = (id: string) => (created.add(id), id);

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  for (const n of ['t1', 't2', 'tOff'] as const) acc[n] = await provisionTestAccount(`tt-${n}`, { role: 'TEACHER', profile: {} });
  for (const n of ['s1', 's2'] as const) acc[n] = await provisionTestAccount(`tt-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`tt-${n}`) } });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  f.year = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id', [`IT ${runId} tt`]);
  f.otherYear = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2024-04-01\', \'2025-03-31\') returning id', [`IT ${runId} tt next`]);
  [f.year, f.otherYear].forEach((id) => track('academicYears', id));
  f.classA = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'9\', \'A\') returning id', [f.year]);
  f.classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'9\', \'B\') returning id', [f.year]);
  f.classC = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'9\', \'C\') returning id', [f.otherYear]);
  [f.classA, f.classB, f.classC].forEach((id) => track('classes', id));
  f.maths = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('tt-math'), testSubjectName('tt maths')]);
  f.science = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('tt-sci'), testSubjectName('tt science')]);
  [f.maths, f.science].forEach((id) => track('subjects', id));

  const teacherId = async (a: TestAccount) => (await db.query('select id from public.teachers where "userId" = $1', [a.userId])).rows[0].id as string;
  f.t1 = await teacherId(acc.t1);
  f.t2 = await teacherId(acc.t2);
  f.tOff = await teacherId(acc.tOff);
  const assign = async (t: string, c: string, s: string) =>
    track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [t, c, s]));
  await assign(f.t1, f.classA, f.maths);
  await assign(f.t1, f.classB, f.maths);
  await assign(f.t1, f.classC, f.maths);
  await assign(f.t2, f.classA, f.science);
  await assign(f.tOff, f.classA, f.science);
  const studentId = async (a: TestAccount) => (await db.query('select id from public.students where "userId" = $1', [a.userId])).rows[0].id as string;
  track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [await studentId(acc.s1), f.classA, f.year]));
  track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [await studentId(acc.s2), f.classB, f.year]));

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  for (const n of ['t1', 't2', 's1', 's2'] as const) ses[n] = await signIn(harness, acc[n].email, acc[n].password);
  await db.query('select public."setAppUserStatus"($1, false, null)', [acc.tOff.userId]);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

describe('create, read, update, delete (admin)', () => {
  let id: string;

  it('creates an entry; the academic year comes from the class; times are HH:MM:SS', async () => {
    id = remember(await entry({ classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '09:00', endTime: '09:45', room: ' Lab 1 ' }));
    const result = await get(ses.admin, id);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      classId: f.classA, subjectId: f.maths, teacherId: f.t1, academicYearId: f.year,
      dayOfWeek: 1, startTime: '09:00:00', endTime: '09:45:00', room: 'Lab 1',
    });
  });

  it('updates an entry and audits the change', async () => {
    const result = await patch(ses.admin, id, { room: 'Lab 2' });
    expect([result.status, result.body.data.room]).toEqual([200, 'Lab 2']);
    const audit = await db.query('select "actorUserId", "metadata" from public."auditLogs" where "entityId" = $1 and action = \'timetableEntries.update\'', [id]);
    expect(audit.rows).toEqual([{ actorUserId: itAdmin.userId, metadata: { changedFields: ['room'] } }]);
  });

  it('deletes an entry (audited); it is then gone', async () => {
    const temp = await entry({ classId: f.classA, subjectId: f.maths, dayOfWeek: 6, startTime: '08:00', endTime: '08:30' });
    const result = await remove(ses.admin, temp);
    expect([result.status, result.body.data.id]).toEqual([200, temp]);
    expect((await get(ses.admin, temp)).status).toBe(404);
    expect((await remove(ses.admin, temp)).status).toBe(404);
    const audit = await db.query('select action from public."auditLogs" where "entityId" = $1 order by "createdAt"', [temp]);
    expect(audit.rows.map((r) => r.action)).toEqual(['timetableEntries.insert', 'timetableEntries.delete']);
  });

  it('an unstaffed period (no teacher) is allowed', async () => {
    const unstaffed = remember(await entry({ classId: f.classB, subjectId: f.science, teacherId: null, dayOfWeek: 2, startTime: '13:00', endTime: '13:40' }));
    expect((await get(ses.admin, unstaffed)).body.data.teacherId).toBeNull();
  });

  it('404 for a missing entry, 400 for a malformed id', async () => {
    expect((await get(ses.admin, MISSING)).status).toBe(404);
    expect((await patch(ses.admin, MISSING, { room: 'x' })).status).toBe(404);
    expect((await get(ses.admin, 'nope')).status).toBe(400);
  });
});

describe('validation (422) — nothing is written', () => {
  const base = () => ({ classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 5, startTime: '14:00', endTime: '14:45' });

  it.each([
    ['end before start', { startTime: '15:00', endTime: '14:00' }, 'endTime'],
    ['end equal to start', { endTime: '14:00' }, 'endTime'],
    ['a malformed time', { startTime: '2pm' }, 'startTime'],
    ['dayOfWeek 0', { dayOfWeek: 0 }, 'dayOfWeek'],
    ['a missing classId', { classId: undefined }, 'classId'],
    ['a client-supplied academicYearId', { academicYearId: MISSING }, ''],
  ])('rejects %s', async (_label, override, path) => {
    const result = await create(ses.admin, { ...base(), ...override });
    expect(result.status).toBe(422);
    expect(result.body.error?.details?.map((d) => d.path)).toContain(path);
  });

  it.each([
    ['class', () => ({ classId: MISSING }), 'classId'],
    ['subject', () => ({ subjectId: MISSING }), 'subjectId'],
    ['teacher', () => ({ teacherId: MISSING }), 'teacherId'],
  ])('rejects a non-existent %s', async (_label, override, path) => {
    const result = await create(ses.admin, { ...base(), ...override() });
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, path]);
  });

  it('rejects a teacher not assigned to that class AND subject', async () => {
    const wrongSubject = await create(ses.admin, { ...base(), teacherId: f.t2 }); // t2 teaches Science in A, not Maths
    expect([wrongSubject.status, wrongSubject.body.error?.details?.[0]]).toEqual([422, { path: 'teacherId', message: 'The teacher is not assigned to teach this subject in this class.' }]);
    const wrongClass = await create(ses.admin, { ...base(), classId: f.classB, subjectId: f.science, teacherId: f.t2 });
    expect(wrongClass.status).toBe(422);
  });

  it('rejects a deactivated teacher', async () => {
    const result = await create(ses.admin, { ...base(), subjectId: f.science, teacherId: f.tOff });
    expect([result.status, result.body.error?.details?.[0].message]).toEqual([422, "The teacher's account is deactivated."]);
  });

  it('nothing was written by the rejected requests', async () => {
    const rows = await db.query('select count(*)::int as n from public."timetableEntries" where "classId" = any($1) and "dayOfWeek" = 5', [[f.classA, f.classB]]);
    expect(rows.rows[0].n).toBe(0);
  });

  it('an update is validated against the complete resulting entry', async () => {
    const id = remember(await entry({ ...base(), dayOfWeek: 4, startTime: '08:00', endTime: '08:45' }));
    const before = await patch(ses.admin, id, { endTime: '07:30' }); // stored start is 08:00
    expect([before.status, before.body.error?.details?.[0].path]).toEqual([422, 'endTime']);
    const restaffed = await patch(ses.admin, id, { teacherId: f.t2 }); // t2 doesn't teach Maths in A
    expect([restaffed.status, restaffed.body.error?.details?.[0].path]).toEqual([422, 'teacherId']);
    const reSubjected = await patch(ses.admin, id, { subjectId: f.science }); // t1 doesn't teach Science in A
    expect(reSubjected.status).toBe(422);
    expect((await get(ses.admin, id)).body.data).toMatchObject({ subjectId: f.maths, teacherId: f.t1, endTime: '08:45:00' });
  });
});

describe('conflicts (database exclusion constraints)', () => {
  let first: string;
  beforeAll(async () => {
    // Monday 10:00–10:45: class A, Maths, t1.
    first = remember(await entry({ classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '10:00', endTime: '10:45' }));
  });

  it('the same class cannot have overlapping periods (409)', async () => {
    const result = await create(ses.admin, { classId: f.classA, subjectId: f.science, teacherId: f.t2, dayOfWeek: 1, startTime: '10:30', endTime: '11:15' });
    expect([result.status, result.body.error?.message]).toEqual([409, CLASS_CONFLICT]);
    const contained = await create(ses.admin, { classId: f.classA, subjectId: f.science, dayOfWeek: 1, startTime: '10:10', endTime: '10:20' });
    expect(contained.status).toBe(409);
  });

  it('the same teacher cannot be in two classes at overlapping times (409)', async () => {
    const result = await create(ses.admin, { classId: f.classB, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '10:15', endTime: '11:00' });
    expect([result.status, result.body.error?.message]).toEqual([409, TEACHER_CONFLICT]);
  });

  it('adjacent periods meeting exactly at a boundary do not conflict', async () => {
    remember(await entry({ classId: f.classA, subjectId: f.science, teacherId: f.t2, dayOfWeek: 1, startTime: '10:45', endTime: '11:30' }));
    remember(await entry({ classId: f.classB, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '10:45', endTime: '11:30' }));
    remember(await entry({ classId: f.classB, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '08:15', endTime: '09:00' }));
  });

  it('the same time on another day, or in another academic year, does not conflict', async () => {
    remember(await entry({ classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 2, startTime: '10:00', endTime: '10:45' }));
    remember(await entry({ classId: f.classC, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '10:00', endTime: '10:45' }));
  });

  it('an update does not conflict with the entry itself, but does with others', async () => {
    const own = await patch(ses.admin, first, { startTime: '10:05', endTime: '10:40' });
    expect(own.status).toBe(200);
    const restore = await patch(ses.admin, first, { startTime: '10:00', endTime: '10:45' });
    expect(restore.status).toBe(200);
    const clash = await patch(ses.admin, first, { endTime: '11:00' }); // runs into A's 10:45 Science
    expect([clash.status, clash.body.error?.message]).toEqual([409, CLASS_CONFLICT]);
    const moved = await patch(ses.admin, first, { classId: f.classB }); // B has t1 at 08:15–09:00 and 10:45–11:30; free 10:00–10:45
    expect(moved.status).toBe(200);
    const back = await patch(ses.admin, first, { classId: f.classA });
    expect(back.status).toBe(200);
  });

  it('409 responses never expose constraint names or SQL', async () => {
    const result = await create(ses.admin, { classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 1, startTime: '10:00', endTime: '10:45' });
    expect(result.status).toBe(409);
    expect(JSON.stringify(result.body)).not.toMatch(/timetableEntries|exclusion|constraint|tsrange/i);
  });

  it('concurrent conflicting requests: exactly one succeeds (class rule)', async () => {
    const results = await Promise.all([
      create(ses.admin, { classId: f.classB, subjectId: f.science, dayOfWeek: 3, startTime: '11:00', endTime: '11:45' }),
      create(ses.admin, { classId: f.classB, subjectId: f.maths, dayOfWeek: 3, startTime: '11:30', endTime: '12:15' }),
    ]);
    results.forEach((r) => r.status === 201 && track('timetableEntries', r.body.data.id));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('concurrent conflicting requests: exactly one succeeds (teacher rule)', async () => {
    const results = await Promise.all([
      create(ses.admin, { classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 4, startTime: '12:00', endTime: '12:45' }),
      create(ses.admin, { classId: f.classB, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 4, startTime: '12:00', endTime: '12:45' }),
    ]);
    results.forEach((r) => r.status === 201 && track('timetableEntries', r.body.data.id));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const rows = await db.query('select count(*)::int as n from public."timetableEntries" where "teacherId" = $1 and "dayOfWeek" = 4 and "startTime" = \'12:00\'', [f.t1]);
    expect(rows.rows[0].n).toBe(1);
  });
});

describe('listing and filters', () => {
  const scope = () => created; // entries this file created

  it('filters by class, teacher, subject, day and academic year', async () => {
    const all = await list(ses.admin, `classId=${f.classA}`);
    expect(all.status).toBe(200);
    expect(all.body.data.items.every((row: { classId: string }) => row.classId === f.classA)).toBe(true);
    const byTeacherDay = await list(ses.admin, `teacherId=${f.t1}&dayOfWeek=1`);
    expect(byTeacherDay.body.data.items.every((row: { teacherId: string; dayOfWeek: number }) => row.teacherId === f.t1 && row.dayOfWeek === 1)).toBe(true);
    expect(byTeacherDay.body.data.items.length).toBeGreaterThanOrEqual(4);
    const bySubject = await list(ses.admin, `subjectId=${f.science}`);
    expect(bySubject.body.data.items.every((row: { subjectId: string }) => row.subjectId === f.science)).toBe(true);
    const otherYear = await list(ses.admin, `academicYearId=${f.otherYear}`);
    expect(otherYear.body.data.items.map((row: { classId: string }) => row.classId)).toEqual([f.classC]);
  });

  it('orders by day, then start time', async () => {
    const result = await list(ses.admin, `teacherId=${f.t1}`);
    const keys = result.body.data.items.map((row: { dayOfWeek: number; startTime: string }) => `${row.dayOfWeek} ${row.startTime}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('rejects bad filters (400)', async () => {
    expect((await list(ses.admin, 'dayOfWeek=9')).status).toBe(400);
    expect((await list(ses.admin, 'classId=nope')).status).toBe(400);
  });

  it("a student sees only their own class's timetable, and cannot fetch another class's entry", async () => {
    const mine = await list(ses.s1);
    expect(mine.status).toBe(200);
    const visibleFixtureClasses = new Set(mine.body.data.items.filter((r: { id: string }) => scope().has(r.id)).map((r: { classId: string }) => r.classId));
    expect([...visibleFixtureClasses]).toEqual([f.classA]);
    const classBEntry = (await list(ses.admin, `classId=${f.classB}`)).body.data.items[0].id;
    expect((await get(ses.s1, classBEntry)).status).toBe(404);
    expect((await get(ses.s2, classBEntry)).status).toBe(200);
  });

  it('a teacher sees their own periods and those of classes they teach, not others', async () => {
    const t2 = await list(ses.t2); // teaches Science in A only
    const classes = new Set(t2.body.data.items.map((r: { classId: string }) => r.classId));
    expect(classes.has(f.classA)).toBe(true);
    expect(classes.has(f.classB)).toBe(false);
    expect(classes.has(f.classC)).toBe(false);
    const t1 = await list(ses.t1, `teacherId=${f.t1}`);
    expect(t1.body.data.items.length).toBeGreaterThan(0);
    expect(idsIn(t1, scope())).toEqual(idsIn(await list(ses.admin, `teacherId=${f.t1}`), scope()));
  });
});

describe('permissions', () => {
  let existing: string;
  beforeAll(async () => {
    existing = (await list(ses.admin, `classId=${f.classA}&dayOfWeek=1`)).body.data.items[0].id;
  });

  it('unauthenticated requests are rejected (401)', async () => {
    expect((await list(anonymous())).status).toBe(401);
    expect((await get(anonymous(), existing)).status).toBe(401);
    expect((await create(anonymous(), { classId: f.classA })).status).toBe(401);
  });

  it('teachers cannot create, update or delete — even their own periods (403)', async () => {
    const own = { classId: f.classA, subjectId: f.maths, teacherId: f.t1, dayOfWeek: 7, startTime: '09:00', endTime: '09:45' };
    expect((await create(ses.t1, own)).status).toBe(403);
    expect((await patch(ses.t1, existing, { room: 'Mine' })).status).toBe(403);
    expect((await remove(ses.t1, existing)).status).toBe(403);
  });

  it('students cannot create, update or delete (403)', async () => {
    expect((await create(ses.s1, { classId: f.classA })).status).toBe(403);
    expect((await patch(ses.s1, existing, { room: 'x' })).status).toBe(403);
    expect((await remove(ses.s1, existing)).status).toBe(403);
  });

  it('the entry is unchanged after the denied writes', async () => {
    expect((await get(ses.admin, existing)).status).toBe(200);
    const rows = await db.query('select count(*)::int as n from public."timetableEntries" where "dayOfWeek" = 7 and "classId" = $1', [f.classA]);
    expect(rows.rows[0].n).toBe(0);
  });
});
