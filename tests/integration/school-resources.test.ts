import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * REAL-SUPABASE tests for academic years, subjects and classes (Phase 3,
 * Checkpoint 2). Route Handlers run in-process against the real project;
 * only Next's cookie store is simulated. Records are uniquely named per run
 * and removed afterwards; assertions never assume an empty database.
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
import {
  ensureItAdmin,
  provisionTestAccount,
  teardown,
  runId,
  testCode,
  track,
  type TestAccount,
} from './helpers/actors';
import { SQLSTATE, actAs, beginSeeded, connect, expectSqlError, rollback } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';
import { ids as fixture } from './helpers/school';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

let itAdmin: TestAccount;
let teacher: TestAccount;
let inactiveTeacher: TestAccount;
let student: TestAccount;
let adminSession: CookieStore;
let teacherSession: CookieStore;
let studentSession: CookieStore;
let teacherId: string;
let inactiveTeacherId: string;
let db: pg.Client;

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);

async function auditActions(entityId: string) {
  const { rows } = await db.query(
    'select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by "createdAt"',
    [entityId],
  );
  return rows;
}

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  teacher = await provisionTestAccount('res-teacher', { role: 'TEACHER', profile: { employeeCode: testCode('emp-a') } });
  inactiveTeacher = await provisionTestAccount('res-teacher-x', { role: 'TEACHER', profile: { employeeCode: testCode('emp-x') } });
  student = await provisionTestAccount('res-student', { role: 'STUDENT', profile: { admissionNumber: testCode('adm') } });

  const teacherRow = async (userId: string) =>
    (await db.query('select id from public.teachers where "userId" = $1', [userId])).rows[0].id as string;
  teacherId = await teacherRow(teacher.userId);
  inactiveTeacherId = await teacherRow(inactiveTeacher.userId);
  await db.query('select public."setAppUserStatus"($1, false, null)', [inactiveTeacher.userId]);

  adminSession = await signIn(harness, itAdmin.email, itAdmin.password);
  teacherSession = await signIn(harness, teacher.email, teacher.password);
  studentSession = await signIn(harness, student.email, student.password);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

// ---------------------------------------------------------------------------------

describe('academic years', () => {
  let yearId: string;
  const name = `IT ${runId}`;

  it('admin creates a year (201) and it is audited', async () => {
    const result = await api(adminSession, years.POST, 'POST', '/api/academic-years', {
      body: { name, startDate: '2098-04-01', endDate: '2099-03-31' },
    });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ name, startDate: '2098-04-01', endDate: '2099-03-31', isCurrent: false });
    yearId = result.body.data.id;
    track('academicYears', yearId);
    expect(await auditActions(yearId)).toEqual([{ action: 'academicYears.insert', actorUserId: itAdmin.userId }]);
  });

  it('any active user can read it; anonymous users cannot', async () => {
    expect((await api(studentSession, year.GET, 'GET', `/api/academic-years/${yearId}`, { params: { id: yearId } })).body.data.id).toBe(yearId);
    expect((await api(anonymous(), years.GET, 'GET', '/api/academic-years')).status).toBe(401);
  });

  it('lists with pagination metadata', async () => {
    const result = await api(teacherSession, years.GET, 'GET', '/api/academic-years?limit=1');
    expect(result.status).toBe(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.pagination).toMatchObject({ page: 1, limit: 1 });
    expect(result.body.data.pagination.total).toBeGreaterThanOrEqual(1);

    const all = await api(adminSession, years.GET, 'GET', '/api/academic-years?limit=100');
    expect(all.body.data.items.map((y: { id: string }) => y.id)).toContain(yearId);
    expect((await api(adminSession, years.GET, 'GET', '/api/academic-years?limit=101')).status).toBe(400);
    const pastEnd = await api(adminSession, years.GET, 'GET', '/api/academic-years?page=99999');
    expect(pastEnd.body.data.items).toEqual([]);
  });

  it('rejects duplicates (409), bad dates (422), unknown fields (422) and malformed JSON (400)', async () => {
    const dup = await api(adminSession, years.POST, 'POST', '/api/academic-years', {
      body: { name, startDate: '2098-04-01', endDate: '2099-03-31' },
    });
    expect([dup.status, dup.body.error?.code]).toEqual([409, 'CONFLICT']);
    expect(dup.body.error?.message).toBe('An academic year with this name already exists.');

    const badDates = await api(adminSession, years.POST, 'POST', '/api/academic-years', {
      body: { name: `${name} b`, startDate: '2099-03-31', endDate: '2098-04-01' },
    });
    expect(badDates.status).toBe(422);

    const smuggled = await api(adminSession, years.POST, 'POST', '/api/academic-years', {
      body: { name: `${name} c`, startDate: '2098-04-01', endDate: '2099-03-31', isCurrent: true },
    });
    expect(smuggled.status).toBe(422);
  });

  it('updates (200), rejects empty updates (422), a date range that the DB would reject (422), and unknown ids (404)', async () => {
    const renamed = await api(adminSession, year.PATCH, 'PATCH', `/api/academic-years/${yearId}`, {
      params: { id: yearId },
      body: { name: `${name} renamed` },
    });
    expect(renamed.body.data.name).toBe(`${name} renamed`);
    expect((await auditActions(yearId)).map((a) => a.action)).toEqual(['academicYears.insert', 'academicYears.update']);

    expect((await api(adminSession, year.PATCH, 'PATCH', `/api/academic-years/${yearId}`, { params: { id: yearId }, body: {} })).status).toBe(422);
    // Only endDate sent: the service can't compare, the database CHECK rejects it → mapped 422.
    const dbCheck = await api(adminSession, year.PATCH, 'PATCH', `/api/academic-years/${yearId}`, {
      params: { id: yearId },
      body: { endDate: '2090-01-01' },
    });
    expect([dbCheck.status, dbCheck.body.error?.details?.[0]?.path]).toEqual([422, 'endDate']);

    expect((await api(adminSession, year.GET, 'GET', `/api/academic-years/${MISSING}`, { params: { id: MISSING } })).status).toBe(404);
    expect((await api(adminSession, year.GET, 'GET', '/api/academic-years/x', { params: { id: 'x' } })).status).toBe(400);
  });

  it('non-admins cannot create, update or switch the current year', async () => {
    const create = await api(teacherSession, years.POST, 'POST', '/api/academic-years', {
      body: { name: `${name} t`, startDate: '2098-04-01', endDate: '2099-03-31' },
    });
    expect(create.status).toBe(403);
    expect((await api(studentSession, year.PATCH, 'PATCH', `/api/academic-years/${yearId}`, { params: { id: yearId }, body: { name: 'x' } })).status).toBe(403);
    expect((await api(teacherSession, setCurrent.POST, 'POST', `/api/academic-years/${yearId}/set-current`, { params: { id: yearId } })).status).toBe(403);
  });

  it('set-current returns 404 for an unknown year (without changing anything)', async () => {
    const result = await api(adminSession, setCurrent.POST, 'POST', `/api/academic-years/${MISSING}/set-current`, { params: { id: MISSING } });
    expect(result.status).toBe(404);
  });
});

describe('switching the current academic year (real function, rolled back)', () => {
  it('leaves exactly one current year, and only admins may do it', async () => {
    const tx = await connect();
    try {
      await beginSeeded(tx);
      await actAs(tx, 'teacherA');
      await expectSqlError(tx, 'select public."setCurrentAcademicYear"($1)', [fixture.year], SQLSTATE.insufficientPrivilege);
      await actAs(tx, 'admin');
      await tx.query('select public."setCurrentAcademicYear"($1)', [fixture.year]);
      await tx.query('select public."setCurrentAcademicYear"($1)', [fixture.year]); // idempotent
      const { rows } = await tx.query('select id from public."academicYears" where "isCurrent"');
      expect(rows).toEqual([{ id: fixture.year }]);
    } finally {
      await rollback(tx);
      await tx.end();
    }
  });
});

// ---------------------------------------------------------------------------------

describe('subjects', () => {
  let subjectId: string;
  const code = testCode('sub');

  it('admin creates a subject; the code is normalized to upper case; audited', async () => {
    const result = await api(adminSession, subjects.POST, 'POST', '/api/subjects', {
      body: { code: code.toLowerCase(), name: 'Integration Science', description: 'IT' },
    });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ code, name: 'Integration Science' });
    subjectId = result.body.data.id;
    track('subjects', subjectId);
    expect(await auditActions(subjectId)).toEqual([{ action: 'subjects.insert', actorUserId: itAdmin.userId }]);
  });

  it('rejects a duplicate code regardless of case (409)', async () => {
    const dup = await api(adminSession, subjects.POST, 'POST', '/api/subjects', { body: { code, name: 'Dup' } });
    expect([dup.status, dup.body.error?.message]).toEqual([409, 'A subject with this code already exists.']);
  });

  it('searches and reads for any active user', async () => {
    const found = await api(studentSession, subjects.GET, 'GET', `/api/subjects?search=${encodeURIComponent(code)}`);
    expect(found.body.data.items.map((s: { id: string }) => s.id)).toEqual([subjectId]);
    expect((await api(studentSession, subjects.GET, 'GET', '/api/subjects?search=a,b')).status).toBe(400);
    expect((await api(teacherSession, subject.GET, 'GET', `/api/subjects/${subjectId}`, { params: { id: subjectId } })).status).toBe(200);
  });

  it('updates for admins only', async () => {
    const updated = await api(adminSession, subject.PATCH, 'PATCH', `/api/subjects/${subjectId}`, {
      params: { id: subjectId },
      body: { description: '' },
    });
    expect(updated.body.data.description).toBeNull();
    const forbidden = await api(teacherSession, subject.PATCH, 'PATCH', `/api/subjects/${subjectId}`, {
      params: { id: subjectId },
      body: { name: 'Hijack' },
    });
    expect(forbidden.status).toBe(403);
    expect((await api(adminSession, subject.PATCH, 'PATCH', `/api/subjects/${MISSING}`, { params: { id: MISSING }, body: { name: 'x' } })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------

describe('classes', () => {
  let yearId: string;
  let ownClassId: string;
  let otherClassId: string;

  beforeAll(async () => {
    const created = await api(adminSession, years.POST, 'POST', '/api/academic-years', {
      body: { name: `IT ${runId} classes`, startDate: '2097-04-01', endDate: '2098-03-31' },
    });
    yearId = created.body.data.id;
    track('academicYears', yearId);
  });

  it('admin creates classes with an active class teacher', async () => {
    const own = await api(adminSession, classes.POST, 'POST', '/api/classes', {
      body: { academicYearId: yearId, name: '10', section: 'A', classTeacherId: teacherId, roomNumber: 'R1' },
    });
    expect(own.status).toBe(201);
    ownClassId = own.body.data.id;
    track('classes', ownClassId);

    const other = await api(adminSession, classes.POST, 'POST', '/api/classes', {
      body: { academicYearId: yearId, name: '10', section: 'B' },
    });
    otherClassId = other.body.data.id;
    track('classes', otherClassId);

    // Enroll the student in 10-A (enrollment APIs arrive in Checkpoint 3).
    const enrolled = await db.query(
      `insert into public."studentEnrollments" ("studentId", "classId", "academicYearId")
       select s.id, $1, $2 from public.students s where s."userId" = $3 returning id`,
      [ownClassId, yearId, student.userId],
    );
    track('studentEnrollments', enrolled.rows[0].id);
  });

  it('rejects duplicates (409) and invalid references (422)', async () => {
    const dup = await api(adminSession, classes.POST, 'POST', '/api/classes', {
      body: { academicYearId: yearId, name: '10', section: 'A' },
    });
    expect(dup.status).toBe(409);

    const noYear = await api(adminSession, classes.POST, 'POST', '/api/classes', {
      body: { academicYearId: MISSING, name: '10', section: 'Z' },
    });
    expect([noYear.status, noYear.body.error?.details?.[0]?.path]).toEqual([422, 'academicYearId']);

    const noTeacher = await api(adminSession, classes.POST, 'POST', '/api/classes', {
      body: { academicYearId: yearId, name: '10', section: 'Y', classTeacherId: MISSING },
    });
    expect([noTeacher.status, noTeacher.body.error?.details?.[0]?.message]).toEqual([422, 'Teacher not found.']);

    const inactive = await api(adminSession, klass.PATCH, 'PATCH', `/api/classes/${otherClassId}`, {
      params: { id: otherClassId },
      body: { classTeacherId: inactiveTeacherId },
    });
    expect([inactive.status, inactive.body.error?.details?.[0]?.message]).toEqual([422, "The teacher's account is deactivated."]);
  });

  it('cannot be moved to another academic year (protects enrollments)', async () => {
    const moved = await api(adminSession, klass.PATCH, 'PATCH', `/api/classes/${ownClassId}`, {
      params: { id: ownClassId },
      body: { academicYearId: MISSING },
    });
    expect(moved.status).toBe(422);
  });

  it('teachers see only the classes they teach', async () => {
    const list = await api(teacherSession, classes.GET, 'GET', `/api/classes?academicYearId=${yearId}`);
    expect(list.body.data.items.map((c: { id: string }) => c.id)).toEqual([ownClassId]);
    expect((await api(teacherSession, klass.GET, 'GET', `/api/classes/${otherClassId}`, { params: { id: otherClassId } })).status).toBe(404);
  });

  it('students see only their own class', async () => {
    const list = await api(studentSession, classes.GET, 'GET', `/api/classes?academicYearId=${yearId}`);
    expect(list.body.data.items.map((c: { id: string }) => c.id)).toEqual([ownClassId]);
    expect((await api(studentSession, klass.GET, 'GET', `/api/classes/${otherClassId}`, { params: { id: otherClassId } })).status).toBe(404);
  });

  it('only admins can create or update classes', async () => {
    expect((await api(teacherSession, classes.POST, 'POST', '/api/classes', { body: { academicYearId: yearId, name: '9', section: 'A' } })).status).toBe(403);
    expect((await api(teacherSession, klass.PATCH, 'PATCH', `/api/classes/${ownClassId}`, { params: { id: ownClassId }, body: { roomNumber: 'X' } })).status).toBe(403);
    expect((await api(anonymous(), classes.GET, 'GET', '/api/classes')).status).toBe(401);
  });

  it('admin updates a class and the change is audited', async () => {
    const updated = await api(adminSession, klass.PATCH, 'PATCH', `/api/classes/${ownClassId}`, {
      params: { id: ownClassId },
      body: { roomNumber: 'R2' },
    });
    expect(updated.body.data.roomNumber).toBe('R2');
    expect((await auditActions(ownClassId)).map((a) => a.action)).toEqual(['classes.insert', 'classes.update']);
  });
});

// ---------------------------------------------------------------------------------

describe('historical-record preservation', () => {
  it('API users — admins included — cannot delete years, classes or subjects', async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: itAdmin.email, password: itAdmin.password });
    for (const table of ['academicYears', 'classes', 'subjects'] as const) {
      const { error } = await client.from(table).delete().eq('id', MISSING);
      expect(error?.code, table).toBe('42501');
    }
  });

  it('a year that has classes cannot be removed even by the database owner', async () => {
    const yearWithClasses = (await db.query(
      'select "academicYearId" from public.classes where name = \'10\' and section = \'A\' and "academicYearId" in (select id from public."academicYears" where name like $1)',
      [`IT ${runId}%`],
    )).rows[0].academicYearId;
    const tx = await connect();
    try {
      await tx.query('begin');
      await expectSqlError(tx, 'delete from public."academicYears" where id = $1', [yearWithClasses], SQLSTATE.foreignKeyViolation);
    } finally {
      await tx.query('rollback');
      await tx.end();
    }
  });
});
