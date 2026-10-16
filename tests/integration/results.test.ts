import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for marks entry and results (Phase 5C). Route Handlers
 * run in-process against the real project. Teacher-side writes use the
 * persistent integration teacher (marks entry is audited and audit entries
 * keep their actor forever); other test users only attempt denied writes.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as results from '@/app/api/results/route';
import * as resultsBulk from '@/app/api/results/bulk/route';
import * as resultOne from '@/app/api/results/[id]/route';
import {
  ensureItAdmin,
  ensureItTeacher,
  provisionTestAccount,
  runId,
  teardown,
  testCode,
  track,
  type TestAccount,
} from './helpers/actors';
import { connect } from './helpers/db';
import { APP, anonymous, call, signIn, type ApiResult } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

let db: pg.Client;
let itAdmin: TestAccount;
let itTeacher: TestAccount;
const acc = {} as Record<'t2' | 's1' | 's2' | 's3' | 's4' | 'a2', TestAccount>;
const sid = {} as Record<'s1' | 's2' | 's3' | 's4', string>;
const ses = {} as Record<'admin' | 'teacher' | 't2' | 's1' | 's2' | 'deactivatedAdmin', CookieStore>;
const p = {} as { aMaths: string; aScience: string; bMaths: string; classA: string; examId: string; maths: string };
let r1: { id: string; updatedAt: string };

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);
const ids = (r: ApiResult) => r.body.data.items.map((i: { id: string }) => i.id);
const marksOf = async (id: string) => Number((await db.query('select "marksObtained" from public.results where id = $1', [id])).rows[0].marksObtained);
const asUser = async (account: TestAccount) => {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: account.email, password: account.password });
  return client;
};

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  itTeacher = await ensureItTeacher();
  acc.t2 = await provisionTestAccount('rs-t2', { role: 'TEACHER', profile: { employeeCode: testCode('rs-t2') } });
  for (const n of ['s1', 's2', 's3', 's4'] as const) {
    acc[n] = await provisionTestAccount(`rs-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`rs-${n}`) } });
    sid[n] = (await db.query('select id from public.students where "userId" = $1', [acc[n].userId])).rows[0].id;
  }
  acc.a2 = await provisionTestAccount('rs-a2', { role: 'ADMIN' });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const teacherId = async (userId: string) => (await db.query('select id from public.teachers where "userId" = $1', [userId])).rows[0].id as string;
  const yearId = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id', [`IT ${runId} results`]);
  track('academicYears', yearId);
  const itTeacherId = await teacherId(itTeacher.userId);
  // The integration teacher teaches Maths in A and is also A's class teacher (but not its Science teacher).
  p.classA = await one('insert into public.classes ("academicYearId", name, section, "classTeacherId") values ($1, \'RS\', \'A\', $2) returning id', [yearId, itTeacherId]);
  const classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'RS\', \'B\') returning id', [yearId]);
  track('classes', p.classA);
  track('classes', classB);
  p.maths = await one('insert into public.subjects (code, name) values ($1, \'Rs Maths\') returning id', [testCode('rs-math')]);
  const science = await one('insert into public.subjects (code, name) values ($1, \'Rs Science\') returning id', [testCode('rs-sci')]);
  track('subjects', p.maths);
  track('subjects', science);
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [itTeacherId, p.classA, p.maths]));
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [await teacherId(acc.t2.userId), classB, p.maths]));
  for (const [s, c] of [['s1', p.classA], ['s2', p.classA], ['s4', p.classA], ['s3', classB]] as const) {
    track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [sid[s], c, yearId]));
  }
  p.examId = await one('insert into public.exams ("academicYearId", name) values ($1, \'IT Term\') returning id', [yearId]);
  track('exams', p.examId);
  const paper = async (classId: string, subjectId: string, max: number) =>
    one('insert into public."examSubjects" ("examId", "classId", "academicYearId", "subjectId", "maxMarks") values ($1, $2, $3, $4, $5) returning id', [p.examId, classId, yearId, subjectId, max]);
  p.aMaths = await paper(p.classA, p.maths, 50);
  p.aScience = await paper(p.classA, science, 100);
  p.bMaths = await paper(classB, p.maths, 50);
  [p.aMaths, p.aScience, p.bMaths].forEach((id) => track('examSubjects', id));

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  ses.teacher = await signIn(harness, itTeacher.email, itTeacher.password);
  ses.t2 = await signIn(harness, acc.t2.email, acc.t2.password);
  ses.s1 = await signIn(harness, acc.s1.email, acc.s1.password);
  ses.s2 = await signIn(harness, acc.s2.email, acc.s2.password);
  ses.deactivatedAdmin = await signIn(harness, acc.a2.email, acc.a2.password);
  for (const userId of [acc.s4.userId, acc.a2.userId]) await db.query('select public."setAppUserStatus"($1, false, null)', [userId]);
});

afterAll(async () => {
  await teardown(itAdmin, itTeacher);
  await db?.end();
});

describe('entering marks', () => {
  it('the subject teacher enters a mark (201); entry is audited with the teacher as actor', async () => {
    const result = await api(ses.teacher, results.POST, 'POST', '/api/results', { body: { examSubjectId: p.aMaths, studentId: sid.s1, marksObtained: 45 } });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ examSubjectId: p.aMaths, studentId: sid.s1, classId: p.classA, marksObtained: 45, enteredByUserId: itTeacher.userId });
    r1 = { id: result.body.data.id, updatedAt: result.body.data.updatedAt };
    track('results', r1.id);
    const { rows } = await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1', [r1.id]);
    expect(rows).toEqual([{ action: 'results.insert', actorUserId: itTeacher.userId }]);
  });

  it('rejects a second result for the same student and paper (409)', async () => {
    const dup = await api(ses.admin, results.POST, 'POST', '/api/results', { body: { examSubjectId: p.aMaths, studentId: sid.s1, marksObtained: 10 } });
    expect([dup.status, dup.body.error?.message]).toEqual([409, 'Marks for this student and exam subject already exist.']);
  });

  it.each([
    ['marks above maxMarks', () => ({ examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: 50.01 }), 'marksObtained'],
    ['marks with three decimals', () => ({ examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: 33.335 }), 'marksObtained'],
    ['negative marks', () => ({ examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: -1 }), 'marksObtained'],
    ["a student not enrolled in the paper's class", () => ({ examSubjectId: p.aMaths, studentId: sid.s3, marksObtained: 10 }), 'studentId'],
    ['an unknown student', () => ({ examSubjectId: p.aMaths, studentId: MISSING, marksObtained: 10 }), 'studentId'],
    ['a deactivated student', () => ({ examSubjectId: p.aMaths, studentId: sid.s4, marksObtained: 10 }), 'studentId'],
    ['an unknown exam subject', () => ({ examSubjectId: MISSING, studentId: sid.s2, marksObtained: 10 }), 'examSubjectId'],
    ['a client-chosen class', () => ({ examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: 10, classId: p.classA }), ''],
  ])('rejects %s (422) and writes nothing', async (_label, body, path) => {
    const result = await api(ses.admin, results.POST, 'POST', '/api/results', { body: body() });
    expect([result.status, result.body.error?.details?.[0]?.path]).toEqual([422, path]);
    expect(Number((await db.query('select count(*) from public.results where "studentId" = any($1)', [[sid.s2, sid.s3, sid.s4]])).rows[0].count)).toBe(0);
  });

  it("a class teacher who doesn't teach the subject, and a teacher of another class, cannot enter marks (403)", async () => {
    expect((await api(ses.teacher, results.POST, 'POST', '/api/results', { body: { examSubjectId: p.aScience, studentId: sid.s1, marksObtained: 10 } })).status).toBe(403);
    expect((await api(ses.t2, results.POST, 'POST', '/api/results', { body: { examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: 10 } })).status).toBe(403);
  });

  it('students cannot enter marks; the database refuses direct writes too', async () => {
    expect((await api(ses.s1, results.POST, 'POST', '/api/results', { body: { examSubjectId: p.aMaths, studentId: sid.s1, marksObtained: 50 } })).status).toBe(403);
    const student = await asUser(acc.s1);
    expect((await student.from('results').insert({ examSubjectId: p.aScience, studentId: sid.s1, classId: p.classA, marksObtained: 99, enteredByUserId: acc.s1.userId })).error?.code).toBe('42501');
    const classTeacher = await asUser(itTeacher);
    expect((await classTeacher.from('results').insert({ examSubjectId: p.aScience, studentId: sid.s2, classId: p.classA, marksObtained: 99, enteredByUserId: itTeacher.userId })).error?.code).toBe('42501');
    expect((await classTeacher.from('results').insert({ examSubjectId: p.aMaths, studentId: sid.s2, classId: p.classA, marksObtained: 51, enteredByUserId: itTeacher.userId })).error?.code).toBe('23514');
  });
});

describe('bulk marks entry', () => {
  it('is all-or-nothing: one existing mark rejects the whole submission (409)', async () => {
    const result = await api(ses.teacher, resultsBulk.POST, 'POST', '/api/results/bulk', {
      body: { examSubjectId: p.aMaths, records: [{ studentId: sid.s2, marksObtained: 30 }, { studentId: sid.s1, marksObtained: 40 }] },
    });
    expect(result.status).toBe(409);
    expect(Number((await db.query('select count(*) from public.results where "studentId" = $1', [sid.s2])).rows[0].count)).toBe(0);
  });

  it('enters marks for several students in one request, including an explicit zero', async () => {
    const admin = await api(ses.admin, resultsBulk.POST, 'POST', '/api/results/bulk', {
      body: { examSubjectId: p.aScience, records: [{ studentId: sid.s1, marksObtained: 72.5 }, { studentId: sid.s2, marksObtained: 0, remarks: 'absent from paper' }] },
    });
    expect(admin.status).toBe(201);
    expect(admin.body.data.count).toBe(2);
    admin.body.data.items.forEach((r: { id: string }) => track('results', r.id));
    expect(admin.body.data.items.find((r: { studentId: string }) => r.studentId === sid.s2).marksObtained).toBe(0);
  });

  it('names invalid records by index', async () => {
    const result = await api(ses.admin, resultsBulk.POST, 'POST', '/api/results/bulk', {
      body: { examSubjectId: p.bMaths, records: [{ studentId: sid.s3, marksObtained: 10 }, { studentId: sid.s1, marksObtained: 10 }] },
    });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'records.1.studentId', message: "The student is not enrolled in the exam subject's class." }]]);
  });
});

describe('reading results', () => {
  it('students see only their own marks', async () => {
    const own = await api(ses.s1, results.GET, 'GET', `/api/results?examId=${p.examId}`);
    expect(new Set(own.body.data.items.map((r: { studentId: string }) => r.studentId))).toEqual(new Set([sid.s1]));
    expect((await api(ses.s2, resultOne.GET, 'GET', `/api/results/${r1.id}`, { params: { id: r1.id } })).status).toBe(404);
    expect((await api(ses.s2, results.GET, 'GET', `/api/results?studentId=${sid.s1}`)).status).toBe(403);
  });

  it('teachers see marks only for papers whose subject they teach', async () => {
    const mine = await api(ses.teacher, results.GET, 'GET', `/api/results?classId=${p.classA}`);
    expect(new Set(mine.body.data.items.map((r: { examSubjectId: string }) => r.examSubjectId))).toEqual(new Set([p.aMaths]));
    expect((await api(ses.t2, resultOne.GET, 'GET', `/api/results/${r1.id}`, { params: { id: r1.id } })).status).toBe(404);
  });

  it('filters by exam, subject, paper and student, with pagination', async () => {
    const bySubject = await api(ses.admin, results.GET, 'GET', `/api/results?examId=${p.examId}&subjectId=${p.maths}`);
    expect(ids(bySubject)).toEqual([r1.id]);
    const page1 = await api(ses.admin, results.GET, 'GET', `/api/results?examId=${p.examId}&limit=1`);
    expect(page1.body.data.pagination).toMatchObject({ total: 3, totalPages: 3 });
    expect(Object.keys(page1.body.data.items[0])).not.toContain('paper');
  });
});

describe('correcting marks', () => {
  it('applies a correction quoting the current updatedAt; audited with old and new marks', async () => {
    const result = await api(ses.teacher, resultOne.PATCH, 'PATCH', `/api/results/${r1.id}`, {
      params: { id: r1.id },
      body: { marksObtained: 47, expectedUpdatedAt: r1.updatedAt },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ marksObtained: 47, enteredByUserId: itTeacher.userId });
    const { rows } = await db.query(
      `select "actorUserId", ("oldData"->>'marksObtained')::numeric as before, ("newData"->>'marksObtained')::numeric as after
       from public."auditLogs" where "entityId" = $1 and action = 'results.update'`,
      [r1.id],
    );
    expect(rows.map((r) => [r.actorUserId, Number(r.before), Number(r.after)])).toEqual([[itTeacher.userId, 45, 47]]);
    r1.updatedAt = result.body.data.updatedAt;
  });

  it('a stale correction is rejected (409) and does not overwrite', async () => {
    const stale = await api(ses.admin, resultOne.PATCH, 'PATCH', `/api/results/${r1.id}`, {
      params: { id: r1.id },
      body: { marksObtained: 10, expectedUpdatedAt: '2020-01-01T00:00:00Z' },
    });
    expect(stale.status).toBe(409);
    expect(await marksOf(r1.id)).toBe(47);
  });

  it('two simultaneous corrections from the same version: exactly one wins', async () => {
    const [a, b] = await Promise.all([
      api(ses.admin, resultOne.PATCH, 'PATCH', `/api/results/${r1.id}`, { params: { id: r1.id }, body: { marksObtained: 48, expectedUpdatedAt: r1.updatedAt } }),
      api(ses.teacher, resultOne.PATCH, 'PATCH', `/api/results/${r1.id}`, { params: { id: r1.id }, body: { marksObtained: 49, expectedUpdatedAt: r1.updatedAt } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(await marksOf(r1.id)).toBe(winner.body.data.marksObtained);
    r1.updatedAt = winner.body.data.updatedAt;
  });

  it('rejects invalid corrections and unauthorized editors', async () => {
    const send = (as: CookieStore, body: object) => api(as, resultOne.PATCH, 'PATCH', `/api/results/${r1.id}`, { params: { id: r1.id }, body });
    expect((await send(ses.admin, { marksObtained: 51, expectedUpdatedAt: r1.updatedAt })).status).toBe(422);
    expect((await send(ses.admin, { marksObtained: 10 })).status).toBe(422); // missing expectedUpdatedAt
    expect((await send(ses.admin, { studentId: sid.s2, expectedUpdatedAt: r1.updatedAt })).status).toBe(422);
    expect((await send(ses.t2, { marksObtained: 1, expectedUpdatedAt: r1.updatedAt })).status).toBe(404);
    expect((await send(ses.s1, { marksObtained: 50, expectedUpdatedAt: r1.updatedAt })).status).toBe(403);
  });

  it("history: results cannot be deleted, and survive the student's deactivation", async () => {
    expect((await (await asUser(itAdmin)).from('results').delete().eq('id', r1.id)).error?.code).toBe('42501');
    await db.query('select public."setAppUserStatus"($1, false, null)', [acc.s1.userId]);
    expect((await api(ses.admin, resultOne.GET, 'GET', `/api/results/${r1.id}`, { params: { id: r1.id } })).status).toBe(200);
  });
});

// --- matrix --------------------------------------------------------------------------

type Role = 'admin' | 'teacher' | 's2';
const endpoints = [
  { name: 'GET /results', handler: results.GET, method: 'GET', path: () => '/api/results', forbidden: [] as Role[], list: true },
  { name: 'POST /results', handler: results.POST, method: 'POST', path: () => '/api/results', forbidden: ['s2'] as Role[], body: () => ({ examSubjectId: p.aMaths, studentId: sid.s2, marksObtained: 1 }) },
  { name: 'POST /results/bulk', handler: resultsBulk.POST, method: 'POST', path: () => '/api/results/bulk', forbidden: ['s2'] as Role[], body: () => ({ examSubjectId: p.aMaths, records: [{ studentId: sid.s2, marksObtained: 1 }] }) },
  { name: 'GET /results/{id}', handler: resultOne.GET, method: 'GET', path: (id: string) => `/api/results/${id}`, id: () => r1.id, forbidden: [] as Role[] },
  { name: 'PATCH /results/{id}', handler: resultOne.PATCH, method: 'PATCH', path: (id: string) => `/api/results/${id}`, id: () => r1.id, forbidden: ['s2'] as Role[], body: () => ({ remarks: 'x', expectedUpdatedAt: r1.updatedAt }) },
];

describe.each(endpoints)('matrix: $name', (e) => {
  const send = (as: CookieStore, o: { id?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const id = o.id ?? ('id' in e && e.id ? e.id() : '');
    return api(as, e.handler, e.method, e.path(id), { params: 'id' in e ? { id } : {}, body: 'body' in o ? o.body : 'body' in e && e.body ? e.body() : undefined, headers: o.headers });
  };
  it('401 anonymous / deactivated session; 403 forbidden roles', async () => {
    expect((await send(anonymous())).status).toBe(401);
    expect((await send(ses.deactivatedAdmin)).status).toBe(401);
    for (const role of e.forbidden) expect((await send(ses[role])).status, role).toBe(403);
  });
  if (e.method !== 'GET') {
    it('rejects cross-site requests', async () => {
      expect((await send(ses.admin, { headers: { origin: 'https://evil.example' } })).body.error?.code).toBe('CSRF_REJECTED');
    });
  }
  if ('id' in e) {
    it('400 malformed id, 404 missing id', async () => {
      expect((await send(ses.admin, { id: 'nope' })).status).toBe(400);
      expect((await send(ses.admin, { id: MISSING })).status).toBe(404);
    });
  }
  if ('body' in e) {
    it('400 malformed JSON; 422 unknown fields / empty body', async () => {
      harness.state.cookies = ses.admin;
      const id = 'id' in e && e.id ? e.id() : '';
      const response = await (e.handler as (r: Request, c: unknown) => Promise<Response>)(
        new Request(`${APP}${e.path(id)}`, { method: e.method, headers: { origin: APP, 'content-type': 'application/json' }, body: '{x' }),
        { params: Promise.resolve('id' in e ? { id } : {}) },
      );
      expect(response.status).toBe(400);
      expect((await send(ses.admin, { body: { ...(e.body as () => object)(), extra: 1 } })).status).toBe(422);
      expect((await send(ses.admin, { body: {} })).status).toBe(422);
    });
  }
  if ('list' in e) {
    it('paginates; invalid pagination and filters are 400', async () => {
      expect(Object.keys((await api(ses.admin, e.handler, 'GET', '/api/results?limit=1')).body.data).sort()).toEqual(['items', 'pagination']);
      for (const q of ['limit=0', 'limit=101', 'examId=x', 'studentId=x']) {
        expect((await api(ses.admin, e.handler, 'GET', `/api/results?${q}`)).status, q).toBe(400);
      }
    });
  }
});
