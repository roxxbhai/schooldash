import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * PHASE 6 VERIFICATION MATRIX (final backend audit) — real Supabase.
 *
 * Gives every timetable and notice endpoint the same battery of contract
 * checks as phase3-matrix.test.ts: authentication, deactivated sessions,
 * roles, CSRF, path/body/query validation, missing resources and the
 * envelope. Every check is rejected before any write.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as timetable from '@/app/api/timetable-entries/route';
import * as timetableEntry from '@/app/api/timetable-entries/[id]/route';
import * as notices from '@/app/api/notices/route';
import * as notice from '@/app/api/notices/[id]/route';
import * as noticeAudiences from '@/app/api/notices/[id]/audiences/route';
import * as noticePublish from '@/app/api/notices/[id]/publish/route';
import * as noticeArchive from '@/app/api/notices/[id]/archive/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { APP, anonymous, call, signIn, type ApiResult } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

type Role = 'admin' | 'teacher' | 'otherTeacher' | 'student' | 'otherStudent';
const ROLES: Role[] = ['admin', 'teacher', 'otherTeacher', 'student', 'otherStudent'];
const ALL = ROLES;
const ADMIN: Role[] = ['admin'];

let db: pg.Client;
let itAdmin: TestAccount;
const sessions = {} as Record<Role | 'deactivatedAdmin', CookieStore>;
const f = {} as { classA: string; subjectId: string; teacherId: string; entryId: string; noticeId: string };

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

interface Endpoint {
  name: string;
  handler: unknown;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: (id: string) => string;
  id?: () => string;
  body?: () => Record<string, unknown>;
  allowed: Role[];
  list?: boolean;
}

const endpoints: Endpoint[] = [
  { name: 'GET /timetable-entries', handler: timetable.GET, method: 'GET', path: () => '/api/timetable-entries', allowed: ALL, list: true },
  { name: 'POST /timetable-entries', handler: timetable.POST, method: 'POST', path: () => '/api/timetable-entries', allowed: ADMIN, body: () => ({ classId: f.classA, subjectId: f.subjectId, dayOfWeek: 7, startTime: '07:00', endTime: '07:30' }) },
  { name: 'GET /timetable-entries/{id}', handler: timetableEntry.GET, method: 'GET', path: (id) => `/api/timetable-entries/${id}`, id: () => f.entryId, allowed: ALL },
  { name: 'PATCH /timetable-entries/{id}', handler: timetableEntry.PATCH, method: 'PATCH', path: (id) => `/api/timetable-entries/${id}`, id: () => f.entryId, allowed: ADMIN, body: () => ({ room: 'x' }) },
  { name: 'DELETE /timetable-entries/{id}', handler: timetableEntry.DELETE, method: 'DELETE', path: (id) => `/api/timetable-entries/${id}`, id: () => f.entryId, allowed: ADMIN },
  { name: 'GET /notices', handler: notices.GET, method: 'GET', path: () => '/api/notices', allowed: ALL, list: true },
  { name: 'POST /notices', handler: notices.POST, method: 'POST', path: () => '/api/notices', allowed: ADMIN, body: () => ({ title: 'x', body: 'y' }) },
  { name: 'GET /notices/{id}', handler: notice.GET, method: 'GET', path: (id) => `/api/notices/${id}`, id: () => f.noticeId, allowed: ALL },
  { name: 'PATCH /notices/{id}', handler: notice.PATCH, method: 'PATCH', path: (id) => `/api/notices/${id}`, id: () => f.noticeId, allowed: ADMIN, body: () => ({ title: 'x' }) },
  { name: 'PUT /notices/{id}/audiences', handler: noticeAudiences.PUT, method: 'PUT', path: (id) => `/api/notices/${id}/audiences`, id: () => f.noticeId, allowed: ADMIN, body: () => ({ audiences: [{ role: 'STUDENT' }] }) },
  { name: 'POST /notices/{id}/publish', handler: noticePublish.POST, method: 'POST', path: (id) => `/api/notices/${id}/publish`, id: () => f.noticeId, allowed: ADMIN },
  { name: 'POST /notices/{id}/archive', handler: noticeArchive.POST, method: 'POST', path: (id) => `/api/notices/${id}/archive`, id: () => f.noticeId, allowed: ADMIN },
];

const request = (e: Endpoint, as: CookieStore, overrides: { id?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const id = overrides.id ?? e.id?.() ?? '';
  return call(harness, as, e.handler, e.method, e.path(id), {
    params: e.id ? { id } : {},
    body: 'body' in overrides ? overrides.body : e.body?.(),
    headers: overrides.headers,
  });
};

async function raw(e: Endpoint, body: string, contentType: string) {
  harness.state.cookies = sessions.admin;
  const id = e.id?.() ?? '';
  const response = await (e.handler as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`${APP}${e.path(id)}`, { method: e.method, headers: { origin: APP, 'content-type': contentType }, body }),
    { params: Promise.resolve(e.id ? { id } : {}) },
  );
  return { status: response.status, body: await response.json() } as ApiResult;
}

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  const t = await provisionTestAccount('m6-teacher', { role: 'TEACHER', profile: { employeeCode: testCode('m6-t') } });
  const t2 = await provisionTestAccount('m6-teacher2', { role: 'TEACHER', profile: { employeeCode: testCode('m6-t2') } });
  const s = await provisionTestAccount('m6-student', { role: 'STUDENT', profile: { admissionNumber: testCode('m6-s') } });
  const s2 = await provisionTestAccount('m6-student2', { role: 'STUDENT', profile: { admissionNumber: testCode('m6-s2') } });
  const a2 = await provisionTestAccount('m6-admin2', { role: 'ADMIN' });

  const id = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  f.teacherId = await id('select id from public.teachers where "userId" = $1', [t.userId]);
  const studentId = await id('select id from public.students where "userId" = $1', [s.userId]);
  const year = await id('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2093-04-01\', \'2094-03-31\') returning id', [`IT ${runId} m6`]);
  track('academicYears', year);
  f.classA = await id('insert into public.classes ("academicYearId", name, section) values ($1, \'M6\', \'A\') returning id', [year]);
  track('classes', f.classA);
  f.subjectId = await id('insert into public.subjects (code, name) values ($1, \'M6\') returning id', [testCode('m6-sub')]);
  track('subjects', f.subjectId);
  track('teacherAssignments', await id('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [f.teacherId, f.classA, f.subjectId]));
  track('studentEnrollments', await id('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [studentId, f.classA, year]));
  f.entryId = await id('insert into public."timetableEntries" ("classId", "subjectId", "teacherId", "dayOfWeek", "startTime", "endTime") values ($1, $2, $3, 1, \'09:00\', \'09:45\') returning id', [f.classA, f.subjectId, f.teacherId]);
  track('timetableEntries', f.entryId);
  f.noticeId = await id('insert into public.notices (title, body, "createdByUserId") values ($1, \'matrix\', $2) returning id', [`IT ${runId} m6`, itAdmin.userId]);
  track('notices', f.noticeId);

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
      const ok = await call(harness, sessions.admin, e.handler, 'GET', `${e.path('')}?page=1&limit=2`);
      expect(ok.status).toBe(200);
      expectEnvelope(ok);
      expect(Object.keys(ok.body.data).sort()).toEqual(['items', 'pagination']);
      expect(ok.body.data.items.length).toBeLessThanOrEqual(2);
      expect(ok.body.data.pagination).toMatchObject({ page: 1, limit: 2 });
      for (const query of ['limit=0', 'limit=101', 'page=0', 'page=abc']) {
        expect((await call(harness, sessions.admin, e.handler, 'GET', `${e.path('')}?${query}`)).status, query).toBe(400);
      }
    });
  }
});

describe('the fixtures are untouched by every rejected request above', () => {
  it('timetable entry and draft notice are unchanged', async () => {
    const entry = (await db.query('select room, "dayOfWeek" from public."timetableEntries" where id = $1', [f.entryId])).rows[0];
    expect(entry).toEqual({ room: null, dayOfWeek: 1 });
    const draft = (await db.query('select title, status, (select count(*)::int from public."noticeAudiences" where "noticeId" = $1) as audiences from public.notices where id = $1', [f.noticeId])).rows[0];
    expect(draft).toEqual({ title: `IT ${runId} m6`, status: 'draft', audiences: 0 });
    const strays = await db.query('select count(*)::int as n from public."timetableEntries" where "classId" = $1 and "dayOfWeek" = 7', [f.classA]);
    expect(strays.rows[0].n).toBe(0);
  });
});
