import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for exams and exam papers (Phase 5B). Route Handlers
 * run in-process against the real project. Records are unique to this run
 * and removed afterwards.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as exams from '@/app/api/exams/route';
import * as exam from '@/app/api/exams/[id]/route';
import * as papers from '@/app/api/exam-subjects/route';
import * as paper from '@/app/api/exam-subjects/[id]/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, testSubjectName, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { APP, anonymous, call, signIn } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

let db: pg.Client;
let itAdmin: TestAccount;
let teacher: TestAccount;
let otherTeacher: TestAccount;
let student: TestAccount;
const ses = {} as Record<'admin' | 'teacher' | 'otherTeacher' | 'student' | 'deactivatedAdmin', CookieStore>;
const f = {} as { yearId: string; otherYearId: string; classA: string; classB: string; classOtherYear: string; maths: string; science: string; studentId: string };
let examId: string;
let paperId: string;

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);
const audit = async (entityId: string) =>
  (await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by "createdAt"', [entityId])).rows;
const asUser = async (account: TestAccount) => {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: account.email, password: account.password });
  return client;
};

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  teacher = await provisionTestAccount('ex-t', { role: 'TEACHER', profile: {} });
  otherTeacher = await provisionTestAccount('ex-t2', { role: 'TEACHER', profile: {} });
  student = await provisionTestAccount('ex-s', { role: 'STUDENT', profile: { admissionNumber: testCode('ex-s') } });
  const deactivated = await provisionTestAccount('ex-a2', { role: 'ADMIN' });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  f.yearId = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id', [`IT ${runId} exams`]);
  f.otherYearId = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2022-04-01\', \'2023-03-31\') returning id', [`IT ${runId} exams old`]);
  [f.yearId, f.otherYearId].forEach((id) => track('academicYears', id));
  f.classA = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'1\', \'A\') returning id', [f.yearId]);
  f.classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'1\', \'B\') returning id', [f.yearId]);
  f.classOtherYear = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'1\', \'A\') returning id', [f.otherYearId]);
  [f.classA, f.classB, f.classOtherYear].forEach((id) => track('classes', id));
  f.maths = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('ex-math'), testSubjectName('ex maths')]);
  f.science = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('ex-sci'), testSubjectName('ex science')]);
  [f.maths, f.science].forEach((id) => track('subjects', id));
  const teacherId = (await db.query('select id from public.teachers where "userId" = $1', [teacher.userId])).rows[0].id;
  const otherTeacherId = (await db.query('select id from public.teachers where "userId" = $1', [otherTeacher.userId])).rows[0].id;
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [teacherId, f.classA, f.maths]));
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [otherTeacherId, f.classB, f.maths]));
  f.studentId = (await db.query('select id from public.students where "userId" = $1', [student.userId])).rows[0].id;
  track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [f.studentId, f.classA, f.yearId]));

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  ses.teacher = await signIn(harness, teacher.email, teacher.password);
  ses.otherTeacher = await signIn(harness, otherTeacher.email, otherTeacher.password);
  ses.student = await signIn(harness, student.email, student.password);
  ses.deactivatedAdmin = await signIn(harness, deactivated.email, deactivated.password);
  await db.query('select public."setAppUserStatus"($1, false, null)', [deactivated.userId]);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

describe('exams', () => {
  const name = `IT ${runId} Term 1`;

  it('admin creates an exam (201); creation is audited', async () => {
    const result = await api(ses.admin, exams.POST, 'POST', '/api/exams', {
      body: { academicYearId: f.yearId, name, startDate: '2023-09-01', endDate: '2023-09-30' },
    });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ academicYearId: f.yearId, name, startDate: '2023-09-01', endDate: '2023-09-30' });
    examId = result.body.data.id;
    track('exams', examId);
    expect(await audit(examId)).toEqual([{ action: 'exams.insert', actorUserId: itAdmin.userId }]);
  });

  it('rejects duplicates (409), dates outside the year (422), unknown years (422) and unknown fields (422)', async () => {
    const dup = await api(ses.admin, exams.POST, 'POST', '/api/exams', { body: { academicYearId: f.yearId, name } });
    expect([dup.status, dup.body.error?.message]).toEqual([409, 'An exam with this name already exists in that academic year.']);
    const outside = await api(ses.admin, exams.POST, 'POST', '/api/exams', { body: { academicYearId: f.yearId, name: `${name} x`, startDate: '2025-01-01' } });
    expect([outside.status, outside.body.error?.details?.[0]?.path]).toEqual([422, 'startDate']);
    const noYear = await api(ses.admin, exams.POST, 'POST', '/api/exams', { body: { academicYearId: MISSING, name: `${name} y` } });
    expect([noYear.status, noYear.body.error?.details?.[0]?.path]).toEqual([422, 'academicYearId']);
    expect((await api(ses.admin, exams.POST, 'POST', '/api/exams', { body: { academicYearId: f.yearId, name: `${name} z`, type: 'final' } })).status).toBe(422);
  });

  it('the same name is allowed in another academic year', async () => {
    const other = await api(ses.admin, exams.POST, 'POST', '/api/exams', { body: { academicYearId: f.otherYearId, name } });
    expect(other.status).toBe(201);
    track('exams', other.body.data.id);
  });

  it('any active user reads exams; filters by year; non-admins cannot write', async () => {
    const listed = await api(ses.student, exams.GET, 'GET', `/api/exams?academicYearId=${f.yearId}`);
    expect(listed.body.data.items.map((e: { id: string }) => e.id)).toEqual([examId]);
    expect((await api(ses.teacher, exam.GET, 'GET', `/api/exams/${examId}`, { params: { id: examId } })).status).toBe(200);
    expect((await api(ses.teacher, exams.POST, 'POST', '/api/exams', { body: { academicYearId: f.yearId, name: 't' } })).status).toBe(403);
    expect((await api(ses.student, exam.PATCH, 'PATCH', `/api/exams/${examId}`, { params: { id: examId }, body: { name: 's' } })).status).toBe(403);
  });

  it('admin updates name/dates (audited); the academic year cannot move', async () => {
    const updated = await api(ses.admin, exam.PATCH, 'PATCH', `/api/exams/${examId}`, { params: { id: examId }, body: { endDate: '2023-10-15' } });
    expect(updated.body.data.endDate).toBe('2023-10-15');
    expect((await audit(examId)).map((a) => a.action)).toEqual(['exams.insert', 'exams.update']);
    expect((await api(ses.admin, exam.PATCH, 'PATCH', `/api/exams/${examId}`, { params: { id: examId }, body: { endDate: '2023-08-01' } })).status).toBe(422);
    expect((await api(ses.admin, exam.PATCH, 'PATCH', `/api/exams/${examId}`, { params: { id: examId }, body: { academicYearId: f.otherYearId } })).status).toBe(422);
    const { error } = await (await asUser(itAdmin)).from('exams').update({ academicYearId: f.otherYearId }).eq('id', examId);
    expect(error?.code).toBe('42501');
  });
});

describe('exam papers (exam subjects)', () => {
  it('admin configures a subject for an exam and class (201, audited); the year comes from the exam', async () => {
    const result = await api(ses.admin, papers.POST, 'POST', '/api/exam-subjects', {
      body: { examId, classId: f.classA, subjectId: f.maths, maxMarks: 100, passMarks: 35, examDate: '2023-09-10' },
    });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ examId, classId: f.classA, academicYearId: f.yearId, subjectId: f.maths, maxMarks: 100, passMarks: 35 });
    paperId = result.body.data.id;
    track('examSubjects', paperId);
    expect(await audit(paperId)).toEqual([{ action: 'examSubjects.insert', actorUserId: itAdmin.userId }]);
  });

  it.each([
    ['a duplicate configuration', () => ({ examId, classId: f.classA, subjectId: f.maths, maxMarks: 50 }), 409, undefined],
    ['a class from another academic year', () => ({ examId, classId: f.classOtherYear, subjectId: f.science, maxMarks: 50 }), 422, 'classId'],
    ['an unknown exam', () => ({ examId: MISSING, classId: f.classA, subjectId: f.science, maxMarks: 50 }), 422, 'examId'],
    ['an unknown class', () => ({ examId, classId: MISSING, subjectId: f.science, maxMarks: 50 }), 422, 'classId'],
    ['an unknown subject', () => ({ examId, classId: f.classA, subjectId: MISSING, maxMarks: 50 }), 422, 'subjectId'],
    ['maxMarks of 0', () => ({ examId, classId: f.classA, subjectId: f.science, maxMarks: 0 }), 422, 'maxMarks'],
    ['passMarks above maxMarks', () => ({ examId, classId: f.classA, subjectId: f.science, maxMarks: 50, passMarks: 51 }), 422, 'passMarks'],
    ['marks with three decimals', () => ({ examId, classId: f.classA, subjectId: f.science, maxMarks: 50.555 }), 422, 'maxMarks'],
    ["an exam date outside the exam's dates", () => ({ examId, classId: f.classA, subjectId: f.science, maxMarks: 50, examDate: '2024-01-10' }), 422, 'examDate'],
  ])('rejects %s', async (_label, body, status, path) => {
    const result = await api(ses.admin, papers.POST, 'POST', '/api/exam-subjects', { body: body() });
    expect(result.status).toBe(status);
    if (path) expect(result.body.error?.details?.[0]?.path).toBe(path);
  });

  it('is visible to teachers of the class and enrolled students only', async () => {
    expect((await api(ses.teacher, paper.GET, 'GET', `/api/exam-subjects/${paperId}`, { params: { id: paperId } })).status).toBe(200);
    expect((await api(ses.student, papers.GET, 'GET', `/api/exam-subjects?examId=${examId}`)).body.data.items.map((p: { id: string }) => p.id)).toEqual([paperId]);
    expect((await api(ses.otherTeacher, paper.GET, 'GET', `/api/exam-subjects/${paperId}`, { params: { id: paperId } })).status).toBe(404);
    expect((await api(ses.otherTeacher, papers.GET, 'GET', `/api/exam-subjects?examId=${examId}`)).body.data.items).toEqual([]);
  });

  it('only admins configure papers (API 403, Data API 42501)', async () => {
    expect((await api(ses.teacher, papers.POST, 'POST', '/api/exam-subjects', { body: { examId, classId: f.classA, subjectId: f.science, maxMarks: 10 } })).status).toBe(403);
    const { error } = await (await asUser(teacher)).from('examSubjects').insert({ examId, classId: f.classA, academicYearId: f.yearId, subjectId: f.science, maxMarks: 10 });
    expect(error?.code).toBe('42501');
  });

  it('maxMarks cannot drop below an entered mark (409), and the paper cannot be relabelled', async () => {
    const result = await db.query(
      'insert into public.results ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, 88, $4) returning id',
      [paperId, f.studentId, f.classA, itAdmin.userId],
    );
    track('results', result.rows[0].id);

    const lowered = await api(ses.admin, paper.PATCH, 'PATCH', `/api/exam-subjects/${paperId}`, { params: { id: paperId }, body: { maxMarks: 80 } });
    expect(lowered.status).toBe(409);
    const ok = await api(ses.admin, paper.PATCH, 'PATCH', `/api/exam-subjects/${paperId}`, { params: { id: paperId }, body: { maxMarks: 90, passMarks: 30 } });
    expect(ok.body.data).toMatchObject({ maxMarks: 90, passMarks: 30 });
    expect((await audit(paperId)).map((a) => a.action)).toEqual(['examSubjects.insert', 'examSubjects.update']);

    expect((await api(ses.admin, paper.PATCH, 'PATCH', `/api/exam-subjects/${paperId}`, { params: { id: paperId }, body: { subjectId: f.science } })).status).toBe(422);
    const { error } = await (await asUser(itAdmin)).from('examSubjects').update({ subjectId: f.science }).eq('id', paperId);
    expect(error?.code).toBe('42501');
  });

  it('history: exams and papers cannot be deleted through the API', async () => {
    const client = await asUser(itAdmin);
    expect((await client.from('exams').delete().eq('id', examId)).error?.code).toBe('42501');
    expect((await client.from('examSubjects').delete().eq('id', paperId)).error?.code).toBe('42501');
  });
});

// --- matrix --------------------------------------------------------------------------

type Role = 'admin' | 'teacher' | 'student';
const endpoints = [
  { name: 'GET /exams', handler: exams.GET, method: 'GET', path: () => '/api/exams', forbidden: [] as Role[], list: true },
  { name: 'POST /exams', handler: exams.POST, method: 'POST', path: () => '/api/exams', forbidden: ['teacher', 'student'] as Role[], body: () => ({ academicYearId: f.yearId, name: 'm' }) },
  { name: 'GET /exams/{id}', handler: exam.GET, method: 'GET', path: (id: string) => `/api/exams/${id}`, id: () => examId, forbidden: [] as Role[] },
  { name: 'PATCH /exams/{id}', handler: exam.PATCH, method: 'PATCH', path: (id: string) => `/api/exams/${id}`, id: () => examId, forbidden: ['teacher', 'student'] as Role[], body: () => ({ name: 'm' }) },
  { name: 'GET /exam-subjects', handler: papers.GET, method: 'GET', path: () => '/api/exam-subjects', forbidden: [] as Role[], list: true },
  { name: 'POST /exam-subjects', handler: papers.POST, method: 'POST', path: () => '/api/exam-subjects', forbidden: ['teacher', 'student'] as Role[], body: () => ({ examId, classId: f.classA, subjectId: f.science, maxMarks: 10 }) },
  { name: 'GET /exam-subjects/{id}', handler: paper.GET, method: 'GET', path: (id: string) => `/api/exam-subjects/${id}`, id: () => paperId, forbidden: [] as Role[] },
  { name: 'PATCH /exam-subjects/{id}', handler: paper.PATCH, method: 'PATCH', path: (id: string) => `/api/exam-subjects/${id}`, id: () => paperId, forbidden: ['teacher', 'student'] as Role[], body: () => ({ examDate: null }) },
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
    it('paginates; invalid pagination/filters are 400', async () => {
      const ok = await api(ses.admin, e.handler, 'GET', `${e.path('')}?limit=1`);
      expect(Object.keys(ok.body.data).sort()).toEqual(['items', 'pagination']);
      for (const q of ['limit=0', 'limit=101', 'examId=x', 'academicYearId=x']) {
        const status = (await api(ses.admin, e.handler, 'GET', `${e.path('')}?${q}`)).status;
        if (q.startsWith('limit')) expect(status, q).toBe(400);
        else if (q.split('=')[0] === (e.name.includes('exam-subjects') ? 'examId' : 'academicYearId')) expect(status, q).toBe(400);
      }
    });
  }
});
