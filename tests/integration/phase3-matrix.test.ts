import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * PHASE 3 VERIFICATION MATRIX — real Supabase.
 *
 * Every implemented Phase 3 endpoint/method gets the same battery of checks
 * (authentication, deactivated sessions, roles, CSRF, path/body/query
 * validation, missing resources, envelope shape), plus targeted regression
 * tests for defects found during the Phase 4 audit. Denial checks are all
 * rejected before any write, so they cannot alter real data.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as years from '@/app/api/academic-years/route';
import * as year from '@/app/api/academic-years/[id]/route';
import * as setCurrent from '@/app/api/academic-years/[id]/set-current/route';
import * as subjects from '@/app/api/subjects/route';
import * as subject from '@/app/api/subjects/[id]/route';
import * as classes from '@/app/api/classes/route';
import * as klass from '@/app/api/classes/[id]/route';
import * as teachers from '@/app/api/teachers/route';
import * as teacher from '@/app/api/teachers/[id]/route';
import * as students from '@/app/api/students/route';
import * as student from '@/app/api/students/[id]/route';
import * as enrollments from '@/app/api/enrollments/route';
import * as enrollment from '@/app/api/enrollments/[id]/route';
import * as assignments from '@/app/api/teacher-assignments/route';
import * as assignment from '@/app/api/teacher-assignments/[id]/route';
import * as deactivate from '@/app/api/users/[id]/deactivate/route';
import * as reactivate from '@/app/api/users/[id]/reactivate/route';
import {
  ensureItAdmin,
  provisionTestAccount,
  teardown,
  runId,
  testCode,
  track,
  type TestAccount,
} from './helpers/actors';
import { connect } from './helpers/db';
import { APP, anonymous, call, signIn, type ApiResult } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

type Role = 'admin' | 'teacher' | 'otherTeacher' | 'student' | 'otherStudent';
const ROLES: Role[] = ['admin', 'teacher', 'otherTeacher', 'student', 'otherStudent'];

let db: pg.Client;
const sessions = {} as Record<Role | 'deactivatedAdmin', CookieStore>;
const f = {} as {
  yearId: string;
  classA: string;
  classB: string;
  subjectId: string;
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  otherStudentId: string;
  studentUserId: string;
  enrollmentA: string;
  enrollmentB: string;
  assignmentId: string;
};
let itAdmin: TestAccount;

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);

function expectEnvelope(result: ApiResult) {
  expect(Object.keys(result.body).sort()).toEqual(['data', 'error']);
  if (result.status < 400) {
    expect(result.body.error).toBeNull();
  } else {
    expect(result.body.data).toBeNull();
    expect(typeof result.body.error?.code).toBe('string');
    expect(typeof result.body.error?.message).toBe('string');
  }
}

// --- endpoint table ---------------------------------------------------------------

interface Endpoint {
  name: string;
  handler: unknown;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: (id: string) => string;
  /** Present for /{id} routes; returns the id of a real fixture record. */
  id?: () => string;
  /** A valid body (only ever sent where the request is rejected before writing). */
  body?: () => Record<string, unknown>;
  /** Roles that pass the role check (others must get 403). */
  allowed: Role[];
  list?: boolean;
}

const ALL: Role[] = ROLES;
const ADMIN: Role[] = ['admin'];

const endpoints: Endpoint[] = [
  { name: 'GET /academic-years', handler: years.GET, method: 'GET', path: () => '/api/academic-years', allowed: ALL, list: true },
  { name: 'POST /academic-years', handler: years.POST, method: 'POST', path: () => '/api/academic-years', allowed: ADMIN, body: () => ({ name: 'x', startDate: '2090-01-01', endDate: '2090-12-31' }) },
  { name: 'GET /academic-years/{id}', handler: year.GET, method: 'GET', path: (id) => `/api/academic-years/${id}`, id: () => f.yearId, allowed: ALL },
  { name: 'PATCH /academic-years/{id}', handler: year.PATCH, method: 'PATCH', path: (id) => `/api/academic-years/${id}`, id: () => f.yearId, allowed: ADMIN, body: () => ({ name: 'renamed' }) },
  { name: 'POST /academic-years/{id}/set-current', handler: setCurrent.POST, method: 'POST', path: (id) => `/api/academic-years/${id}/set-current`, id: () => f.yearId, allowed: ADMIN },
  { name: 'GET /subjects', handler: subjects.GET, method: 'GET', path: () => '/api/subjects', allowed: ALL, list: true },
  { name: 'POST /subjects', handler: subjects.POST, method: 'POST', path: () => '/api/subjects', allowed: ADMIN, body: () => ({ code: 'X', name: 'X' }) },
  { name: 'GET /subjects/{id}', handler: subject.GET, method: 'GET', path: (id) => `/api/subjects/${id}`, id: () => f.subjectId, allowed: ALL },
  { name: 'PATCH /subjects/{id}', handler: subject.PATCH, method: 'PATCH', path: (id) => `/api/subjects/${id}`, id: () => f.subjectId, allowed: ADMIN, body: () => ({ name: 'x' }) },
  { name: 'GET /classes', handler: classes.GET, method: 'GET', path: () => '/api/classes', allowed: ALL, list: true },
  { name: 'POST /classes', handler: classes.POST, method: 'POST', path: () => '/api/classes', allowed: ADMIN, body: () => ({ academicYearId: f.yearId, name: '1', section: 'Z' }) },
  { name: 'GET /classes/{id}', handler: klass.GET, method: 'GET', path: (id) => `/api/classes/${id}`, id: () => f.classA, allowed: ALL },
  { name: 'PATCH /classes/{id}', handler: klass.PATCH, method: 'PATCH', path: (id) => `/api/classes/${id}`, id: () => f.classA, allowed: ADMIN, body: () => ({ roomNumber: 'x' }) },
  { name: 'GET /teachers', handler: teachers.GET, method: 'GET', path: () => '/api/teachers', allowed: ADMIN, list: true },
  { name: 'POST /teachers', handler: teachers.POST, method: 'POST', path: () => '/api/teachers', allowed: ADMIN, body: () => ({ email: 'x@example.com', fullName: 'X', phone: '9876543210', employeeCode: 'X' }) },
  { name: 'GET /teachers/{id}', handler: teacher.GET, method: 'GET', path: (id) => `/api/teachers/${id}`, id: () => f.teacherId, allowed: ['admin', 'teacher'] },
  { name: 'PATCH /teachers/{id}', handler: teacher.PATCH, method: 'PATCH', path: (id) => `/api/teachers/${id}`, id: () => f.teacherId, allowed: ADMIN, body: () => ({ qualification: 'x' }) },
  { name: 'GET /students', handler: students.GET, method: 'GET', path: () => '/api/students', allowed: ['admin', 'teacher', 'otherTeacher'], list: true },
  { name: 'POST /students', handler: students.POST, method: 'POST', path: () => '/api/students', allowed: ADMIN, body: () => ({ email: 'x@example.com', fullName: 'X', admissionNumber: 'X' }) },
  { name: 'GET /students/{id}', handler: student.GET, method: 'GET', path: (id) => `/api/students/${id}`, id: () => f.studentId, allowed: ['admin', 'teacher', 'otherTeacher', 'student'] },
  { name: 'PATCH /students/{id}', handler: student.PATCH, method: 'PATCH', path: (id) => `/api/students/${id}`, id: () => f.studentId, allowed: ADMIN, body: () => ({ address: 'x' }) },
  { name: 'GET /enrollments', handler: enrollments.GET, method: 'GET', path: () => '/api/enrollments', allowed: ALL, list: true },
  { name: 'POST /enrollments', handler: enrollments.POST, method: 'POST', path: () => '/api/enrollments', allowed: ADMIN, body: () => ({ studentId: f.studentId, classId: f.classA }) },
  { name: 'GET /enrollments/{id}', handler: enrollment.GET, method: 'GET', path: (id) => `/api/enrollments/${id}`, id: () => f.enrollmentA, allowed: ALL },
  { name: 'PATCH /enrollments/{id}', handler: enrollment.PATCH, method: 'PATCH', path: (id) => `/api/enrollments/${id}`, id: () => f.enrollmentA, allowed: ADMIN, body: () => ({ rollNumber: 9 }) },
  { name: 'GET /teacher-assignments', handler: assignments.GET, method: 'GET', path: () => '/api/teacher-assignments', allowed: ALL, list: true },
  { name: 'POST /teacher-assignments', handler: assignments.POST, method: 'POST', path: () => '/api/teacher-assignments', allowed: ADMIN, body: () => ({ teacherId: f.teacherId, classId: f.classB, subjectId: f.subjectId }) },
  { name: 'GET /teacher-assignments/{id}', handler: assignment.GET, method: 'GET', path: (id) => `/api/teacher-assignments/${id}`, id: () => f.assignmentId, allowed: ALL },
  { name: 'DELETE /teacher-assignments/{id}', handler: assignment.DELETE, method: 'DELETE', path: (id) => `/api/teacher-assignments/${id}`, id: () => f.assignmentId, allowed: ADMIN },
  { name: 'POST /users/{id}/deactivate', handler: deactivate.POST, method: 'POST', path: (id) => `/api/users/${id}/deactivate`, id: () => f.studentUserId, allowed: ADMIN },
  { name: 'POST /users/{id}/reactivate', handler: reactivate.POST, method: 'POST', path: (id) => `/api/users/${id}/reactivate`, id: () => f.studentUserId, allowed: ADMIN },
];

const request = (e: Endpoint, as: CookieStore, overrides: { id?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const id = overrides.id ?? e.id?.() ?? '';
  return api(as, e.handler, e.method, e.path(id), {
    params: e.id ? { id } : {},
    body: 'body' in overrides ? overrides.body : e.body?.(),
    headers: overrides.headers,
  });
};

/** Raw request for malformed bodies / content types. */
async function raw(e: Endpoint, body: string, contentType: string) {
  harness.state.cookies = sessions.admin;
  const id = e.id?.() ?? '';
  const response = await (e.handler as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`${APP}${e.path(id)}`, { method: e.method, headers: { origin: APP, 'content-type': contentType }, body }),
    { params: Promise.resolve(e.id ? { id } : {}) },
  );
  return { status: response.status, body: await response.json() } as ApiResult;
}

// --- fixtures ------------------------------------------------------------------------

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  const t = await provisionTestAccount('mx-teacher', { role: 'TEACHER', profile: { employeeCode: testCode('mx-t') } });
  const t2 = await provisionTestAccount('mx-teacher2', { role: 'TEACHER', profile: { employeeCode: testCode('mx-t2') } });
  const s = await provisionTestAccount('mx-student', { role: 'STUDENT', profile: { admissionNumber: testCode('mx-s') } });
  const s2 = await provisionTestAccount('mx-student2', { role: 'STUDENT', profile: { admissionNumber: testCode('mx-s2') } });
  const a2 = await provisionTestAccount('mx-admin2', { role: 'ADMIN' });

  const id = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  f.teacherId = await id('select id from public.teachers where "userId" = $1', [t.userId]);
  f.otherTeacherId = await id('select id from public.teachers where "userId" = $1', [t2.userId]);
  f.studentId = await id('select id from public.students where "userId" = $1', [s.userId]);
  f.otherStudentId = await id('select id from public.students where "userId" = $1', [s2.userId]);
  f.studentUserId = s.userId;
  f.yearId = await id('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2094-04-01\', \'2095-03-31\') returning id', [`IT ${runId} matrix`]);
  track('academicYears', f.yearId);
  f.classA = await id('insert into public.classes ("academicYearId", name, section) values ($1, \'M\', \'A\') returning id', [f.yearId]);
  f.classB = await id('insert into public.classes ("academicYearId", name, section) values ($1, \'M\', \'B\') returning id', [f.yearId]);
  track('classes', f.classA);
  track('classes', f.classB);
  f.subjectId = await id('insert into public.subjects (code, name) values ($1, \'Matrix\') returning id', [testCode('mx-sub')]);
  track('subjects', f.subjectId);
  f.assignmentId = await id('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [f.teacherId, f.classA, f.subjectId]);
  track('teacherAssignments', f.assignmentId);
  f.enrollmentA = await id('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [f.studentId, f.classA, f.yearId]);
  f.enrollmentB = await id('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [f.otherStudentId, f.classB, f.yearId]);
  track('studentEnrollments', f.enrollmentA);
  track('studentEnrollments', f.enrollmentB);

  sessions.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  sessions.teacher = await signIn(harness, t.email, t.password);
  sessions.otherTeacher = await signIn(harness, t2.email, t2.password);
  sessions.student = await signIn(harness, s.email, s.password);
  sessions.otherStudent = await signIn(harness, s2.email, s2.password);
  sessions.deactivatedAdmin = await signIn(harness, a2.email, a2.password);
  await db.query('select public."setAppUserStatus"($1, false, null)', [a2.userId]); // keeps its cookie
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

// --- the matrix ----------------------------------------------------------------------

describe.each(endpoints)('$name', (e) => {
  it('rejects unauthenticated requests with 401', async () => {
    const result = await request(e, anonymous());
    expect([result.status, result.body.error?.code]).toEqual([401, 'UNAUTHORIZED']);
    expectEnvelope(result);
  });

  it("rejects a deactivated admin's existing session", async () => {
    const result = await request(e, sessions.deactivatedAdmin);
    expect(result.status).toBe(401);
    expectEnvelope(result);
  });

  it('enforces roles (forbidden roles get 403)', async () => {
    for (const role of ROLES.filter((r) => !e.allowed.includes(r))) {
      const result = await request(e, sessions[role]);
      expect(result.status, role).toBe(403);
      expectEnvelope(result);
    }
  });

  if (e.method !== 'GET') {
    it('rejects cross-site requests before doing anything', async () => {
      const result = await request(e, sessions.admin, { headers: { origin: 'https://evil.example' } });
      expect([result.status, result.body.error?.code]).toEqual([403, 'CSRF_REJECTED']);
    });
  }

  if (e.id) {
    it('rejects a malformed id with 400', async () => {
      const result = await request(e, sessions.admin, { id: 'not-a-uuid' });
      expect(result.status).toBe(400);
      expectEnvelope(result);
    });

    it('returns 404 for a nonexistent id', async () => {
      const result = await request(e, sessions.admin, { id: MISSING });
      expect([result.status, result.body.error?.code]).toEqual([404, 'NOT_FOUND']);
      expectEnvelope(result);
    });
  }

  if (e.body) {
    it('rejects malformed JSON (400), non-JSON bodies (400), unknown fields (422) and empty objects (422)', async () => {
      expect((await raw(e, '{oops', 'application/json')).body.error?.code).toBe('INVALID_JSON');
      expect((await raw(e, 'a=b', 'application/x-www-form-urlencoded')).status).toBe(400);
      const unknown = await request(e, sessions.admin, { body: { ...e.body!(), unexpectedField: true } });
      expect([unknown.status, unknown.body.error?.code]).toEqual([422, 'VALIDATION_ERROR']);
      expect((await request(e, sessions.admin, { body: {} })).status).toBe(422);
    });
  }

  if (e.list) {
    it('returns a paginated envelope and rejects invalid pagination', async () => {
      const ok = await api(sessions.admin, e.handler, 'GET', `${e.path('')}?page=1&limit=2`);
      expect(ok.status).toBe(200);
      expectEnvelope(ok);
      expect(Object.keys(ok.body.data).sort()).toEqual(['items', 'pagination']);
      expect(ok.body.data.items.length).toBeLessThanOrEqual(2);
      expect(ok.body.data.pagination).toMatchObject({ page: 1, limit: 2 });
      for (const query of ['limit=0', 'limit=101', 'page=0', 'page=abc']) {
        expect((await api(sessions.admin, e.handler, 'GET', `${e.path('')}?${query}`)).status, query).toBe(400);
      }
    });
  }
});

// --- targeted checks for behaviours not covered above or in earlier suites ------------

describe('filters reject malformed ids (400)', () => {
  it.each([
    ['/api/classes?academicYearId=x', classes.GET],
    ['/api/students?classId=x', students.GET],
    ['/api/students?isActive=maybe', students.GET],
    ['/api/teachers?isActive=1', teachers.GET],
    ['/api/enrollments?studentId=x', enrollments.GET],
    ['/api/teacher-assignments?teacherId=x', assignments.GET],
  ])('%s', async (path, handler) => {
    expect((await api(sessions.admin, handler, 'GET', path)).status).toBe(400);
  });
});

describe('scoped reads by id (RLS → 404, ownership → 403)', () => {
  it("another student's enrollment is invisible to a student (404) and to an unassigned teacher (404)", async () => {
    const asOther = await api(sessions.otherStudent, enrollment.GET, 'GET', `/api/enrollments/${f.enrollmentA}`, { params: { id: f.enrollmentA } });
    expect(asOther.status).toBe(404);
    const asTeacher = await api(sessions.otherTeacher, enrollment.GET, 'GET', `/api/enrollments/${f.enrollmentA}`, { params: { id: f.enrollmentA } });
    expect(asTeacher.status).toBe(404);
    const own = await api(sessions.student, enrollment.GET, 'GET', `/api/enrollments/${f.enrollmentA}`, { params: { id: f.enrollmentA } });
    expect(own.body.data.id).toBe(f.enrollmentA);
  });

  it("another teacher's assignment is invisible to a teacher (404)", async () => {
    const result = await api(sessions.otherTeacher, assignment.GET, 'GET', `/api/teacher-assignments/${f.assignmentId}`, { params: { id: f.assignmentId } });
    expect(result.status).toBe(404);
  });

  it("a teacher who doesn't teach a student gets 404, the student's teacher gets the record", async () => {
    expect((await api(sessions.otherTeacher, student.GET, 'GET', `/api/students/${f.studentId}`, { params: { id: f.studentId } })).status).toBe(404);
    expect((await api(sessions.teacher, student.GET, 'GET', `/api/students/${f.studentId}`, { params: { id: f.studentId } })).status).toBe(200);
  });

  it("another student's record is 403 for a student; another teacher's record is 403 for a teacher", async () => {
    expect((await api(sessions.otherStudent, student.GET, 'GET', `/api/students/${f.studentId}`, { params: { id: f.studentId } })).status).toBe(403);
    expect((await api(sessions.otherTeacher, teacher.GET, 'GET', `/api/teachers/${f.teacherId}`, { params: { id: f.teacherId } })).status).toBe(403);
  });
});

describe('audit coverage for admin updates', () => {
  const actions = async (entityId: string) =>
    (await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by "createdAt"', [entityId])).rows;

  it('subject and enrollment updates are audited with the acting admin', async () => {
    await api(sessions.admin, subject.PATCH, 'PATCH', `/api/subjects/${f.subjectId}`, { params: { id: f.subjectId }, body: { name: 'Matrix 2' } });
    expect(await actions(f.subjectId)).toContainEqual({ action: 'subjects.update', actorUserId: itAdmin.userId });

    await api(sessions.admin, enrollment.PATCH, 'PATCH', `/api/enrollments/${f.enrollmentA}`, { params: { id: f.enrollmentA }, body: { rollNumber: 7 } });
    expect(await actions(f.enrollmentA)).toContainEqual({ action: 'studentEnrollments.update', actorUserId: itAdmin.userId });
  });

  it('an update that changes nothing is not audited', async () => {
    const before = (await actions(f.subjectId)).length;
    await api(sessions.admin, subject.PATCH, 'PATCH', `/api/subjects/${f.subjectId}`, { params: { id: f.subjectId }, body: { name: 'Matrix 2' } });
    expect((await actions(f.subjectId)).length).toBe(before);
  });
});

describe('student profile updates', () => {
  it('a duplicate admission number is 409 and the whole update is rolled back', async () => {
    const result = await api(sessions.admin, student.PATCH, 'PATCH', `/api/students/${f.studentId}`, {
      params: { id: f.studentId },
      body: { fullName: 'Must Not Persist', admissionNumber: testCode('mx-s2') },
    });
    expect(result.status).toBe(409);
    const { rows } = await db.query('select u."fullName" from public.users u join public.students s on s."userId" = u.id where s.id = $1', [f.studentId]);
    expect(rows[0].fullName).not.toBe('Must Not Persist');
  });

  it('an invalid date is 422 and an unknown student is 404', async () => {
    expect((await api(sessions.admin, student.PATCH, 'PATCH', `/api/students/${f.studentId}`, { params: { id: f.studentId }, body: { dateOfBirth: '2012-13-40' } })).status).toBe(422);
    expect((await api(sessions.admin, student.PATCH, 'PATCH', `/api/students/${MISSING}`, { params: { id: MISSING }, body: { address: 'x' } })).status).toBe(404);
  });
});

describe('account status', () => {
  it('reactivating an account that is already active is a no-op', async () => {
    const result = await api(sessions.admin, reactivate.POST, 'POST', `/api/users/${f.studentUserId}/reactivate`, { params: { id: f.studentUserId } });
    expect(result.body.data).toMatchObject({ isActive: true, changed: false });
  });
});

// --- regression tests for defects found in the Phase 4 audit -------------------------

describe('REGRESSION: stable pagination (defect: non-unique sort keys)', () => {
  /** Walks every page of a list with limit=1 and returns all ids seen, in order. */
  async function walk(handler: unknown, path: string) {
    const seen: string[] = [];
    for (let page = 1; ; page++) {
      const result = await api(sessions.admin, handler, 'GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=1`);
      expect(result.status).toBe(200);
      seen.push(...result.body.data.items.map((item: { id: string }) => item.id));
      if (page >= result.body.data.pagination.totalPages) break;
    }
    return seen;
  }

  it('academic years sharing a start date each appear exactly once across pages', async () => {
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const { rows } = await db.query(
        'insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2093-04-01\', \'2094-03-31\') returning id',
        [`IT ${runId} tie ${n}`],
      );
      ids.push(rows[0].id);
      track('academicYears', rows[0].id);
    }
    const seen = await walk(years.GET, '/api/academic-years');
    for (const id of ids) expect(seen.filter((s) => s === id), id).toHaveLength(1);
  });

  it('enrollments with equal date and no roll number each appear exactly once across pages', async () => {
    const extra: string[] = [];
    for (const n of [1, 2, 3]) {
      const s = await provisionTestAccount(`mx-tie-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`mx-tie-${n}`) } });
      const { rows } = await db.query(
        `insert into public."studentEnrollments" ("studentId", "classId", "academicYearId", "enrolledOn")
         select id, $2, $3, '2094-05-01' from public.students where "userId" = $1 returning id`,
        [s.userId, f.classB, f.yearId],
      );
      extra.push(rows[0].id);
      track('studentEnrollments', rows[0].id);
    }
    const seen = await walk(enrollments.GET, `/api/enrollments?classId=${f.classB}`);
    for (const id of [...extra, f.enrollmentB]) expect(seen.filter((s) => s === id), id).toHaveLength(1);
  });
});

describe('REGRESSION: list shape does not depend on filters (defect: leaked join field)', () => {
  it('students listed with ?classId= have exactly the same fields as without', async () => {
    const filtered = await api(sessions.admin, students.GET, 'GET', `/api/students?classId=${f.classA}`);
    expect(filtered.body.data.items.map((s: { id: string }) => s.id)).toEqual([f.studentId]);
    const unfiltered = await api(sessions.admin, student.GET, 'GET', `/api/students/${f.studentId}`, { params: { id: f.studentId } });
    expect(Object.keys(filtered.body.data.items[0]).sort()).toEqual(Object.keys(unfiltered.body.data).sort());
    expect(filtered.body.data.items[0]).not.toHaveProperty('enrollment');
  });
});
