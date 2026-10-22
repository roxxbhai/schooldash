import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for notices (Phase 6C). Route Handlers run in-process
 * against the real project with real sessions; visibility is decided by the
 * real RLS policies (app.canViewNotice). A few tests call the Data API
 * directly with a real session to prove the database rules hold even when the
 * application is bypassed.
 *
 * Only the integration admin writes notices (audited). Notices published here
 * are titled "IT <run>" and are deleted on teardown; while a run is in
 * progress, role-targeted test notices are briefly visible to that role.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as collection from '@/app/api/notices/route';
import * as single from '@/app/api/notices/[id]/route';
import * as audiencesRoute from '@/app/api/notices/[id]/audiences/route';
import * as publishRoute from '@/app/api/notices/[id]/publish/route';
import * as archiveRoute from '@/app/api/notices/[id]/archive/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, testSubjectName, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';
const T = (label: string) => `IT ${runId} ${label}`;

let db: pg.Client;
let itAdmin: TestAccount;
type Who = 't1' | 't2' | 'tClass' | 's1' | 's2' | 'sOff';
const acc = {} as Record<Who, TestAccount>;
const ses = {} as Record<'admin' | Who, CookieStore>;
const f = {} as { classA: string; classB: string };

type Body = Record<string, unknown>;
const create = (as: CookieStore, body: Body) => call(harness, as, collection.POST, 'POST', '/api/notices', { body });
const list = (as: CookieStore, query = '') => call(harness, as, collection.GET, 'GET', `/api/notices?limit=100&${query}`);
const get = (as: CookieStore, id: string) => call(harness, as, single.GET, 'GET', `/api/notices/${id}`, { params: { id } });
const patch = (as: CookieStore, id: string, body: Body) => call(harness, as, single.PATCH, 'PATCH', `/api/notices/${id}`, { body, params: { id } });
const target = (as: CookieStore, id: string, audiences: unknown[]) =>
  call(harness, as, audiencesRoute.PUT, 'PUT', `/api/notices/${id}/audiences`, { body: { audiences }, params: { id } });
const publish = (as: CookieStore, id: string) => call(harness, as, publishRoute.POST, 'POST', `/api/notices/${id}/publish`, { params: { id } });
const archive = (as: CookieStore, id: string) => call(harness, as, archiveRoute.POST, 'POST', `/api/notices/${id}/archive`, { params: { id } });

/** Creates a draft as admin, asserts 201 and tracks it. */
async function draft(label: string, audiences: unknown[] = []): Promise<string> {
  const result = await create(ses.admin, { title: T(label), body: 'Body', audiences });
  expect(result.status, JSON.stringify(result.body.error)).toBe(201);
  track('notices', result.body.data.id);
  return result.body.data.id;
}
async function published(label: string, audiences: unknown[]): Promise<string> {
  const id = await draft(label, audiences);
  expect((await publish(ses.admin, id)).status).toBe(200);
  return id;
}

const dataApi = async (account: TestAccount) => {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: account.email, password: account.password });
  return client;
};

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  for (const n of ['t1', 't2', 'tClass'] as const) acc[n] = await provisionTestAccount(`nt-${n}`, { role: 'TEACHER', profile: {} });
  for (const n of ['s1', 's2', 'sOff'] as const) acc[n] = await provisionTestAccount(`nt-${n}`, { role: 'STUDENT', profile: { admissionNumber: testCode(`nt-${n}`) } });

  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const year = await one('insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2023-04-01\', \'2024-03-31\') returning id', [T('year')]);
  track('academicYears', year);
  const teacherId = async (a: TestAccount) => (await db.query('select id from public.teachers where "userId" = $1', [a.userId])).rows[0].id as string;
  f.classA = await one('insert into public.classes ("academicYearId", name, section, "classTeacherId") values ($1, \'2\', \'A\', $2) returning id', [year, await teacherId(acc.tClass)]);
  f.classB = await one('insert into public.classes ("academicYearId", name, section) values ($1, \'2\', \'B\') returning id', [year]);
  [f.classA, f.classB].forEach((id) => track('classes', id));
  const subject = await one('insert into public.subjects (code, name) values ($1, $2) returning id', [testCode('nt-sub'), testSubjectName('nt')]);
  track('subjects', subject);
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [await teacherId(acc.t1), f.classA, subject]));
  track('teacherAssignments', await one('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3) returning id', [await teacherId(acc.t2), f.classB, subject]));
  const studentId = async (a: TestAccount) => (await db.query('select id from public.students where "userId" = $1', [a.userId])).rows[0].id as string;
  for (const [who, cls] of [['s1', f.classA], ['s2', f.classB], ['sOff', f.classA]] as const) {
    track('studentEnrollments', await one('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId") values ($1, $2, $3) returning id', [await studentId(acc[who]), cls, year]));
  }

  ses.admin = await signIn(harness, itAdmin.email, itAdmin.password);
  for (const n of ['t1', 't2', 'tClass', 's1', 's2', 'sOff'] as const) ses[n] = await signIn(harness, acc[n].email, acc[n].password);
  await db.query('select public."setAppUserStatus"($1, false, null)', [acc.sOff.userId]);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

describe('lifecycle: draft → published → archived', () => {
  let id: string;

  it('an admin creates a draft with audiences in one step', async () => {
    const result = await create(ses.admin, { title: ` ${T('lifecycle')} `, body: 'Sports day on Friday.', category: 'Events', audiences: [{ role: 'STUDENT' }, { classId: f.classB }] });
    expect(result.status).toBe(201);
    id = result.body.data.id;
    track('notices', id);
    expect(result.body.data).toMatchObject({ title: T('lifecycle'), status: 'draft', publishedAt: null, category: 'Events', createdByUserId: itAdmin.userId });
    expect(result.body.data.audiences.map((a: { role: string | null; classId: string | null }) => [a.role, a.classId])).toEqual([[null, f.classB], ['STUDENT', null]]);
  });

  it('drafts are invisible to every intended recipient (by id and in lists)', async () => {
    for (const who of ['s1', 's2', 't2'] as const) {
      expect((await get(ses[who], id)).status, who).toBe(404);
      expect((await list(ses[who])).body.data.items.map((n: { id: string }) => n.id), who).not.toContain(id);
    }
  });

  it('an admin edits the draft and replaces its audiences atomically (both audited)', async () => {
    const edited = await patch(ses.admin, id, { body: 'Sports day moved to Saturday.', category: null });
    expect([edited.status, edited.body.data.body, edited.body.data.category]).toEqual([200, 'Sports day moved to Saturday.', null]);
    const retargeted = await target(ses.admin, id, [{ classId: f.classA }]);
    expect(retargeted.status).toBe(200);
    expect(retargeted.body.data.audiences.map((a: { classId: string }) => a.classId)).toEqual([f.classA]);
    const audit = await db.query('select action from public."auditLogs" where "entityId" = $1 or ("entityType" = \'noticeAudiences\' and "newData"->>\'noticeId\' = $1::text) or ("entityType" = \'noticeAudiences\' and "oldData"->>\'noticeId\' = $1::text)', [id]);
    const actions = audit.rows.map((r) => r.action).sort();
    expect(actions).toEqual(['noticeAudiences.delete', 'noticeAudiences.delete', 'noticeAudiences.insert', 'noticeAudiences.insert', 'noticeAudiences.insert', 'notices.insert', 'notices.update']);
  });

  it('publishing stamps publishedAt with the database clock', async () => {
    const before = Date.now();
    const result = await publish(ses.admin, id);
    expect([result.status, result.body.data.status]).toEqual([200, 'published']);
    expect(Math.abs(Date.parse(result.body.data.publishedAt) - before)).toBeLessThan(60_000);
  });

  it('a published notice is locked: no edits, no re-targeting, no second publish (409)', async () => {
    expect([(await patch(ses.admin, id, { title: 'x' })).status, (await patch(ses.admin, id, { title: 'x' })).body.error?.message]).toEqual([409, 'Only draft notices can be edited.']);
    const retarget = await target(ses.admin, id, [{ role: 'TEACHER' }]);
    expect([retarget.status, retarget.body.error?.message]).toEqual([409, 'Audiences can change only while the notice is a draft.']);
    expect((await publish(ses.admin, id)).status).toBe(409);
    expect((await get(ses.admin, id)).body.data).toMatchObject({ title: T('lifecycle'), status: 'published', audiences: [{ classId: f.classA }] });
  });

  it('archiving hides it from recipients; archived is final', async () => {
    expect((await get(ses.s1, id)).status).toBe(200);
    const result = await archive(ses.admin, id);
    expect([result.status, result.body.data.status]).toEqual([200, 'archived']);
    expect(result.body.data.publishedAt).not.toBeNull();
    expect((await get(ses.s1, id)).status).toBe(404);
    expect((await get(ses.admin, id)).status).toBe(200);
    expect((await archive(ses.admin, id)).status).toBe(409);
    expect((await publish(ses.admin, id)).status).toBe(409); // no republishing
    expect((await patch(ses.admin, id, { title: 'x' })).status).toBe(409);
  });

  it('a draft can be archived directly', async () => {
    const unused = await draft('discarded');
    expect((await archive(ses.admin, unused)).body.data.status).toBe('archived');
  });

  it('a notice without any audience cannot be published (409) and stays a draft', async () => {
    const empty = await draft('no audience');
    const result = await publish(ses.admin, empty);
    expect([result.status, result.body.error?.message]).toEqual([409, 'Add at least one audience before publishing.']);
    expect((await get(ses.admin, empty)).body.data.status).toBe('draft');
  });

  it('404 for a missing notice, 400 for a malformed id', async () => {
    expect((await get(ses.admin, MISSING)).status).toBe(404);
    expect((await patch(ses.admin, MISSING, { title: 'x' })).status).toBe(404);
    expect((await target(ses.admin, MISSING, [])).status).toBe(404);
    expect((await publish(ses.admin, MISSING)).status).toBe(404);
    expect((await archive(ses.admin, MISSING)).status).toBe(404);
    expect((await get(ses.admin, 'nope')).status).toBe(400);
  });
});

describe('validation (422) — nothing is written', () => {
  it.each([
    ['a blank title', { title: '  ', body: 'b' }, 'title'],
    ['a missing body', { title: 'x' }, 'body'],
    ['a client-supplied status', { title: 'x', body: 'b', status: 'published' }, ''],
    ['a client-supplied createdByUserId', { title: 'x', body: 'b', createdByUserId: MISSING }, ''],
    ['an unknown audience role', { title: 'x', body: 'b', audiences: [{ role: 'PARENT' }] }, 'audiences.0'],
    ['an audience with role AND class', { title: 'x', body: 'b', audiences: [{ role: 'STUDENT', classId: MISSING }] }, 'audiences.0'],
    ['a duplicate audience', { title: 'x', body: 'b', audiences: [{ role: 'STUDENT' }, { role: 'STUDENT' }] }, 'audiences.1'],
  ])('rejects %s', async (_label, body, path) => {
    const result = await create(ses.admin, body);
    expect(result.status).toBe(422);
    expect(result.body.error?.details?.map((d) => d.path)).toContain(path);
  });

  it('rejects a class audience that does not exist, pointing at the entry', async () => {
    const result = await create(ses.admin, { title: T('bad class'), body: 'b', audiences: [{ role: 'STUDENT' }, { classId: MISSING }] });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'audiences.1.classId', message: 'Class not found.' }]]);
    const rows = await db.query('select count(*)::int as n from public.notices where title = $1', [T('bad class')]);
    expect(rows.rows[0].n).toBe(0);
  });
});

describe('audience visibility (real RLS)', () => {
  const n = {} as Record<'students' | 'teachers' | 'classA' | 'classB', string>;
  beforeAll(async () => {
    n.students = await published('to students', [{ role: 'STUDENT' }]);
    n.teachers = await published('to teachers', [{ role: 'TEACHER' }]);
    n.classA = await published('to class A', [{ classId: f.classA }]);
    n.classB = await published('to class B', [{ classId: f.classB }]);
  });

  const visible = async (who: Who) => {
    const ids = new Set(Object.values(n));
    const result = await list(ses[who]);
    expect(result.status).toBe(200);
    return Object.entries(n).filter(([, id]) => ids.has(id) && result.body.data.items.some((row: { id: string }) => row.id === id)).map(([k]) => k).sort();
  };

  it.each([
    ['s1', ['classA', 'students']], // student in class A
    ['s2', ['classB', 'students']], // student in class B
    ['t1', ['classA', 'teachers']], // teaches a subject in class A
    ['t2', ['classB', 'teachers']], // teaches a subject in class B
    ['tClass', ['classA', 'teachers']], // class teacher of A without a subject assignment
  ] as const)('%s sees exactly the notices addressed to them', async (who, expected) => {
    expect(await visible(who)).toEqual(expected);
  });

  it('guessing the id of a notice for another audience is a 404', async () => {
    expect((await get(ses.s1, n.classB)).status).toBe(404);
    expect((await get(ses.s1, n.teachers)).status).toBe(404);
    expect((await get(ses.t1, n.students)).status).toBe(404);
    expect((await get(ses.t2, n.classA)).status).toBe(404);
  });

  it('cannot be addressed to admins, who already see every notice (422)', async () => {
    const result = await create(ses.admin, { title: T('to admins'), body: 'b', audiences: [{ role: 'ADMIN' }] });
    expect(result.status).toBe(422);
  });

  it('recipients get the notice without audience details; admins with them', async () => {
    const forStudent = await get(ses.s1, n.classA);
    expect(forStudent.status).toBe(200);
    expect(forStudent.body.data).not.toHaveProperty('audiences');
    expect((await get(ses.admin, n.classA)).body.data.audiences).toHaveLength(1);
  });

  it('admins see every notice in every state; the status filter works', async () => {
    const drafts = await list(ses.admin, 'status=draft');
    expect(drafts.body.data.items.every((row: { status: string }) => row.status === 'draft')).toBe(true);
    expect((await list(ses.admin, 'status=PUBLISHED')).status).toBe(400);
  });

  it('unauthenticated and deactivated users get nothing (401)', async () => {
    expect((await list(anonymous())).status).toBe(401);
    expect((await get(anonymous(), n.students)).status).toBe(401);
    expect((await get(ses.sOff, n.classA)).status).toBe(401);
  });
});

describe('permissions', () => {
  let id: string;
  beforeAll(async () => {
    id = await draft('permissions', [{ role: 'TEACHER' }]);
  });

  it.each(['t1', 's1'] as const)('%s cannot create, edit, target, publish or archive (403)', async (who) => {
    expect((await create(ses[who], { title: 'x', body: 'y' })).status).toBe(403);
    expect((await patch(ses[who], id, { title: 'x' })).status).toBe(403);
    expect((await target(ses[who], id, [{ role: 'STUDENT' }])).status).toBe(403);
    expect((await publish(ses[who], id)).status).toBe(403);
    expect((await archive(ses[who], id)).status).toBe(403);
    expect((await get(ses.admin, id)).body.data).toMatchObject({ status: 'draft', title: T('permissions'), audiences: [{ role: 'TEACHER' }] });
  });
});

describe('database rules hold when the API is bypassed (direct Data API)', () => {
  it('a teacher cannot insert notices or audiences, or call the notice functions', async () => {
    const teacher = await dataApi(acc.t1);
    const id = await draft('direct teacher', [{ role: 'TEACHER' }]);
    expect((await teacher.from('notices').insert({ title: 'x', body: 'y', createdByUserId: acc.t1.userId })).error?.code).toBe('42501');
    expect((await teacher.from('noticeAudiences').insert({ noticeId: id, audienceRole: 'student' })).error?.code).toBe('42501');
    expect((await teacher.rpc('publishNotice', { noticeId: id })).error?.code).toBe('42501');
    expect((await teacher.rpc('createNotice', { title: 'x', body: 'y', category: null as never, audiences: [] })).error?.code).toBe('42501');
  });

  it('even an admin cannot insert an already-published notice, or rewrite a published one', async () => {
    const admin = await dataApi(itAdmin);
    const insert = await admin.from('notices').insert({ title: T('direct'), body: 'y', createdByUserId: itAdmin.userId, status: 'published', publishedAt: new Date().toISOString() });
    expect(insert.error?.code).toBe('42501');
    const id = await published('direct published', [{ role: 'TEACHER' }]);
    expect((await admin.from('notices').update({ status: 'draft' }).eq('id', id)).error?.code).toBe('55000');
    expect((await admin.from('notices').update({ title: 'changed' }).eq('id', id)).error?.code).toBe('55000');
    expect((await admin.from('notices').update({ publishedAt: '2000-01-01T00:00:00Z' }).eq('id', id)).error?.code).toBe('55000');
    expect((await admin.from('noticeAudiences').insert({ noticeId: id, audienceRole: 'student' })).error?.code).toBe('42501');
    const removed = await admin.from('noticeAudiences').delete().eq('noticeId', id).select('id');
    expect([removed.error, removed.data]).toEqual([null, []]); // RLS: no rows of a published notice are deletable
    expect((await get(ses.admin, id)).body.data).toMatchObject({ title: T('direct published'), status: 'published', audiences: [{ role: 'TEACHER' }] });
  });

  it('partial failure: a create with one bad audience leaves no notice; a bad re-target keeps the old audiences', async () => {
    const admin = await dataApi(itAdmin);
    const create = await admin.rpc('createNotice', { title: T('atomic'), body: 'b', category: null as never, audiences: [{ audienceRole: 'student' }, { classId: MISSING }] });
    expect(create.error?.code).toBe('23503');
    expect((await db.query('select count(*)::int as n from public.notices where title = $1', [T('atomic')])).rows[0].n).toBe(0);

    const id = await draft('atomic retarget', [{ role: 'TEACHER' }]);
    const retarget = await admin.rpc('setNoticeAudiences', { noticeId: id, audiences: [{ audienceRole: 'student' }, { classId: MISSING }] });
    expect(retarget.error?.code).toBe('23503');
    expect((await get(ses.admin, id)).body.data.audiences.map((a: { role: string }) => a.role)).toEqual(['TEACHER']);
  });
});

describe('concurrency', () => {
  it('two simultaneous publishes: exactly one succeeds', async () => {
    const id = await draft('double publish', [{ role: 'TEACHER' }]);
    const results = await Promise.all([publish(ses.admin, id), publish(ses.admin, id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('publishing while the audiences are being cleared never yields a published notice without audiences', async () => {
    for (let i = 0; i < 3; i++) {
      const id = await draft(`race ${i}`, [{ role: 'TEACHER' }]);
      const [published, cleared] = await Promise.all([publish(ses.admin, id), target(ses.admin, id, [])]);
      expect([published.status, cleared.status].sort()).toEqual([200, 409]);
      const final = (await get(ses.admin, id)).body.data;
      if (final.status === 'published') expect(final.audiences).toHaveLength(1);
      else expect([final.status, final.audiences]).toEqual(['draft', []]);
    }
  });
});
