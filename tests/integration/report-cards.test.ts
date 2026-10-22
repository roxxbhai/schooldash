import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for report-card data (Phase 5D). Marks are inserted as
 * the database owner for setup; every read goes through the Route Handler
 * with the caller's session, so RLS shapes what each role receives.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET as reportCard } from '@/app/api/students/[id]/report-cards/[examId]/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, testSubjectName, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

let db: pg.Client;
let itAdmin: TestAccount;
const acc = {} as Record<'t1' | 't2' | 's1' | 's2' | 's3' | 'a2', TestAccount>;
const sid = {} as Record<'s1' | 's2' | 's3', string>;
const ses = {} as Record<'admin' | 't1' | 't2' | 's1' | 's2' | 'deactivatedAdmin', CookieStore>;
const f = {} as { exam: string; oldExam: string; otherYearExam: string; classA: string; classB: string; oldClass: string };

const card = (as: CookieStore, studentId: string, examId: string) =>
  call(harness, as, reportCard, 'GET', `/api/students/${studentId}/report-cards/${examId}`, { params: { id: studentId, examId } });

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  for (const n of ['t1', 't2'] as const) acc[n] = await provisionTestAccount(`rc-${n}`, { role: 'TEACHER', profile: {} });
  for (const n of ['s1', 's2', 's3'] as const) {
    acc[n] = await provisionTestAccount(`rc-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`rc-${n}`) } });
    sid[n] = (await db.query('select id from public.students where "userId" = $1', [acc[n].userId])).rows[0].id;
  }
  acc.a2 = await provisionTestAccount('rc-a2', { role: 'ADMIN' });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const year = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id', [`IT ${runId} rc`]);
  const oldYear = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2022-04-01\', \'2023-03-31\') returning id', [`IT ${runId} rc old`]);
  const emptyYear = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2021-04-01\', \'2022-03-31\') returning id', [`IT ${runId} rc empty`]);
  [year, oldYear, emptyYear].forEach((id) => track('academicYears', id));
  f.classA = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'5\', \'A\') returning id', [year]);
  f.classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'5\', \'B\') returning id', [year]);
  f.oldClass = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'5\', \'Z\') returning id', [oldYear]);
  [f.classA, f.classB, f.oldClass].forEach((id) => track('classes', id));
  const subj = async (code: string) => { const id = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode(code), testSubjectName(code.replace('-', ' '))]); track('subjects', id); return id; };
  const eng = await subj('rc-eng');
  const math = await subj('rc-math');
  const sci = await subj('rc-sci');
  const teacherId = async (a: TestAccount) => (await db.query('select id from public.teachers where "userId" = $1', [a.userId])).rows[0].id;
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [await teacherId(acc.t1), f.classA, math]));
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [await teacherId(acc.t2), f.classB, math]));
  const enroll = async (s: string, c: string, y: string) =>
    track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [s, c, y]));
  await enroll(sid.s1, f.classA, year);
  await enroll(sid.s2, f.classA, year);
  await enroll(sid.s3, f.classB, year);
  await enroll(sid.s1, f.oldClass, oldYear);

  f.exam = await one('insert into public.exams ("academicYearId", name) values ($1, \'Term 1\') returning id', [year]);
  f.oldExam = await one('insert into public.exams ("academicYearId", name) values ($1, \'Old Term\') returning id', [oldYear]);
  f.otherYearExam = await one('insert into public.exams ("academicYearId", name) values ($1, \'Empty Year Term\') returning id', [emptyYear]);
  [f.exam, f.oldExam, f.otherYearExam].forEach((id) => track('exams', id));
  const paper = async (exam: string, cls: string, y: string, subject: string, max: number, pass: number | null) => {
    const id = await one('insert into public."examSubjects" ("examId", "classId", "academicYearId", "subjectId", "maxMarks", "passMarks") values ($1, $2, $3, $4, $5, $6) returning id', [exam, cls, y, subject, max, pass]);
    track('examSubjects', id);
    return id;
  };
  const aEng = await paper(f.exam, f.classA, year, eng, 33.33, 10);
  const aMath = await paper(f.exam, f.classA, year, math, 33.33, null);
  const aSci = await paper(f.exam, f.classA, year, sci, 33.34, 12);
  const oldMath = await paper(f.oldExam, f.oldClass, oldYear, math, 100, 35);
  const mark = async (paperId: string, s: string, cls: string, marks: number) =>
    track('results', await one('insert into public.results ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, $4, $5) returning id', [paperId, s, cls, marks, itAdmin.userId]));
  // s1: complete, including a zero. s2: Maths missing.
  await mark(aEng, sid.s1, f.classA, 30.5);
  await mark(aMath, sid.s1, f.classA, 0);
  await mark(aSci, sid.s1, f.classA, 33.34);
  await mark(aEng, sid.s2, f.classA, 20);
  await mark(aSci, sid.s2, f.classA, 25);
  await mark(oldMath, sid.s1, f.oldClass, 77);

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  ses.t1 = await signIn(harness, acc.t1.email, acc.t1.password);
  ses.t2 = await signIn(harness, acc.t2.email, acc.t2.password);
  ses.s1 = await signIn(harness, acc.s1.email, acc.s1.password);
  ses.s2 = await signIn(harness, acc.s2.email, acc.s2.password);
  ses.deactivatedAdmin = await signIn(harness, acc.a2.email, acc.a2.password);
  await db.query('select public."setAppUserStatus"($1, false, null)', [acc.a2.userId]);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

describe('report-card data', () => {
  it('complete card: every subject, exact totals, a zero counted as a real mark', async () => {
    const result = await card(ses.s1, sid.s1, f.exam);
    expect(result.status).toBe(200);
    const data = result.body.data;
    expect(data.student).toMatchObject({ id: sid.s1, admissionNumber: testCode('rc-s1'), fullName: 'IT rc-s1' });
    expect(data.exam).toMatchObject({ id: f.exam, name: 'Term 1' });
    expect(data.class).toMatchObject({ id: f.classA, name: '5', section: 'A' });
    expect(data.scope).toBe('allSubjects');
    expect(data.subjects.map((s: { subjectCode: string; marksObtained: number; maxMarks: number; passMarks: number | null }) => [s.subjectCode, s.marksObtained, s.maxMarks, s.passMarks])).toEqual([
      [testCode('rc-eng'), 30.5, 33.33, 10],
      [testCode('rc-math'), 0, 33.33, null],
      [testCode('rc-sci'), 33.34, 33.34, 12],
    ]);
    expect(data.summary).toEqual({ subjectsConfigured: 3, subjectsWithMarks: 3, complete: true, totalMarksObtained: 63.84, totalMaxMarks: 100 });
  });

  it('incomplete card: the missing subject is null/notEntered (not zero) and there are no totals', async () => {
    const result = await card(ses.admin, sid.s2, f.exam);
    const maths = result.body.data.subjects.find((s: { subjectCode: string }) => s.subjectCode === testCode('rc-math'));
    expect(maths).toMatchObject({ marksObtained: null, status: 'notEntered' });
    expect(result.body.data.summary).toEqual({ subjectsConfigured: 3, subjectsWithMarks: 2, complete: false, totalMarksObtained: null, totalMaxMarks: null });
  });

  it("uses the class the student was in during the exam's academic year", async () => {
    const result = await card(ses.s1, sid.s1, f.oldExam);
    expect(result.body.data.class.id).toBe(f.oldClass);
    expect(result.body.data.summary).toMatchObject({ complete: true, totalMarksObtained: 77, totalMaxMarks: 100 });
  });

  it("404 when the student wasn't enrolled in the exam's academic year, or the exam doesn't exist", async () => {
    expect((await card(ses.admin, sid.s1, f.otherYearExam)).status).toBe(404);
    expect((await card(ses.admin, sid.s1, MISSING)).status).toBe(404);
    expect((await card(ses.admin, MISSING, f.exam)).status).toBe(404);
  });

  it('400 for malformed ids', async () => {
    expect((await call(harness, ses.admin, reportCard, 'GET', '/x', { params: { id: 'x', examId: f.exam } })).status).toBe(400);
    expect((await call(harness, ses.admin, reportCard, 'GET', '/x', { params: { id: sid.s1, examId: 'x' } })).status).toBe(400);
  });
});

describe('report-card access', () => {
  it('a student can read only their own card', async () => {
    expect((await card(ses.s2, sid.s2, f.exam)).status).toBe(200);
    expect((await card(ses.s2, sid.s1, f.exam)).status).toBe(403);
  });

  it('a teacher sees only their own subjects for students they teach, without totals', async () => {
    const result = await card(ses.t1, sid.s1, f.exam);
    expect(result.status).toBe(200);
    expect(result.body.data.scope).toBe('assignedSubjects');
    expect(result.body.data.subjects.map((s: { subjectCode: string }) => s.subjectCode)).toEqual([testCode('rc-math')]);
    expect(result.body.data.summary).toMatchObject({ complete: false, totalMarksObtained: null, totalMaxMarks: null });
  });

  it("a teacher who doesn't teach the student is refused (404/403)", async () => {
    expect((await card(ses.t2, sid.s1, f.exam)).status).toBe(404); // RLS hides students they don't teach
    expect((await card(ses.t1, sid.s3, f.exam)).status).toBe(404);
  });

  it('unauthenticated and deactivated sessions are rejected', async () => {
    expect((await card(anonymous(), sid.s1, f.exam)).status).toBe(401);
    expect((await card(ses.deactivatedAdmin, sid.s1, f.exam)).status).toBe(401);
  });
});
