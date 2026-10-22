import { ensureItAdmin, runId, teardown, testCode, testEmail, testPassword, testPhone, track } from './helpers/actors';
import type { TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn, signInAsStudent, signUpAsTeacher } from './helpers/http';
import type { CookieStore } from './helpers/http';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as deactivate } from '@/app/api/users/[id]/deactivate/route';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import type pg from 'pg';

/**
 * REAL-SUPABASE tests for teachers, students, enrollments and teacher
 * assignments (Phase 3, Checkpoint 3). Route Handlers run in-process against
 * the real project; provisioning creates real Auth identities. Every record is
 * unique to this run and removed afterwards.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as teachers from '@/app/api/teachers/route';
import * as teacherById from '@/app/api/teachers/[id]/route';
import * as students from '@/app/api/students/route';
import * as studentById from '@/app/api/students/[id]/route';
import * as enrollments from '@/app/api/enrollments/route';
import * as enrollmentById from '@/app/api/enrollments/[id]/route';
import * as assignments from '@/app/api/teacher-assignments/route';
import * as assignmentById from '@/app/api/teacher-assignments/[id]/route';

const harness = { state };
const MISSING = '00000000-0000-4000-8000-00000000dead';

let db: pg.Client;
let itAdmin: TestAccount;
let adminSession: CookieStore;

// School skeleton for this run (created as the DB owner, tracked).
let yearId: string;
let otherYearId: string;
let classA: string;
let classB: string;
let classOtherYear: string;
let subjectId: string;

// People created through the API in this run.
const people: Record<string, { email: string; password: string; userId: string; id: string; session?: CookieStore }> = {};

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) =>
  call(harness, as, handler, method, path, options);

const authIdFor = async (email: string) =>
  (await createSupabaseAdminClient().rpc('findAuthUserIdByEmail', { email })).data;

async function trackAccount(email: string) {
  const authId = await authIdFor(email);
  track('authUsers', authId);
  return authId;
}

async function audit(entityId: string) {
  const { rows } = await db.query(
    'select action, "actorUserId", "oldData", "newData", metadata from public."auditLogs" where "entityId" = $1 order by "createdAt"',
    [entityId],
  );
  return rows;
}

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  adminSession = await signIn(harness, itAdmin.email, itAdmin.password);

  const insert = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  yearId = await insert(
    'insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2016-04-01\', \'2017-03-31\') returning id',
    [`IT ${runId} people`],
  );
  otherYearId = await insert(
    'insert into public."academicYears" (name, "startDate", "endDate") values ($1, \'2015-04-01\', \'2016-03-31\') returning id',
    [`IT ${runId} people old`],
  );
  track('academicYears', yearId);
  track('academicYears', otherYearId);
  classA = await insert('insert into public.classes ("academicYearId", name, section) values ($1, \'7\', \'A\') returning id', [yearId]);
  classB = await insert('insert into public.classes ("academicYearId", name, section) values ($1, \'7\', \'B\') returning id', [yearId]);
  classOtherYear = await insert('insert into public.classes ("academicYearId", name, section) values ($1, \'6\', \'A\') returning id', [otherYearId]);
  [classA, classB, classOtherYear].forEach((id) => track('classes', id));
  subjectId = await insert('insert into public.subjects (code, name) values ($1, \'IT Subject\') returning id', [testCode('pplsub')]);
  track('subjects', subjectId);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

// ---------------------------------------------------------------------------------

describe('teacher management', () => {
  it('admin creates teachers through provisioning (201); creation is audited; each teacher then signs up', async () => {
    for (const label of ['t1', 't2']) {
      const email = testEmail(label);
      const phone = testPhone();
      const password = testPassword();
      const result = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
        body: { email, phone, fullName: `IT Teacher ${label}`, employeeCode: testCode(label), qualification: 'B.Ed' },
      });
      expect(result.status).toBe(201);
      expect(result.body.data).toMatchObject({
        employeeCode: testCode(label),
        user: { fullName: `IT Teacher ${label}`, email, phone, isActive: true, passwordSetAt: null },
      });
      await trackAccount(email);
      people[label] = { email, password, userId: result.body.data.userId, id: result.body.data.id };
      // THE TEACHER CHOOSES THEIR OWN PASSWORD (NO INITIAL PASSWORD FROM THE ADMIN).
      people[label].session = await signUpAsTeacher(harness, phone, password);
    }
    expect((await audit(people.t1.userId)).map((a) => [a.action, a.actorUserId])).toEqual([
      ['users.provision', itAdmin.userId],
      ['users.teacherSignUp', null],
    ]);
  });

  it('rejects duplicate emails without creating another Auth identity', async () => {
    const result = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email: people.t1.email, phone: testPhone(), fullName: 'Dup', employeeCode: testCode('dup') },
    });
    expect(result.status).toBe(409);
  });

  it('a duplicate employee code fails with 409 and leaves no orphaned Auth user (compensation)', async () => {
    const email = testEmail('t-dupcode');
    const result = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email, phone: testPhone(), fullName: 'Dup Code', employeeCode: testCode('t1') },
    });
    expect(result.status).toBe(409);
    expect(await authIdFor(email)).toBeNull();
  });

  it('rejects client-chosen roles and invalid fields (422), and non-admin callers (401/403)', async () => {
    const injected = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email: testEmail('x'), phone: testPhone(), fullName: 'X', employeeCode: testCode('x'), role: 'ADMIN' },
    });
    expect(injected.status).toBe(422);
    expect(await authIdFor(testEmail('x'))).toBeNull();

    people.t1.session = await signIn(harness, people.t1.email, people.t1.password);
    expect((await api(people.t1.session, teachers.POST, 'POST', '/api/teachers', { body: {} })).status).toBe(403);
    expect((await api(people.t1.session, teachers.GET, 'GET', '/api/teachers')).status).toBe(403);
    expect((await api(anonymous(), teachers.GET, 'GET', '/api/teachers')).status).toBe(401);
  });

  it('a teacher can read only their own record', async () => {
    const own = await api(people.t1.session!, teacherById.GET, 'GET', `/api/teachers/${people.t1.id}`, { params: { id: people.t1.id } });
    expect(own.body.data.id).toBe(people.t1.id);
    const other = await api(people.t1.session!, teacherById.GET, 'GET', `/api/teachers/${people.t2.id}`, { params: { id: people.t2.id } });
    expect(other.status).toBe(403);
  });

  it('admin updates name and profile atomically; audit records changed fields only', async () => {
    const result = await api(adminSession, teacherById.PATCH, 'PATCH', `/api/teachers/${people.t1.id}`, {
      params: { id: people.t1.id },
      body: { fullName: 'IT Teacher Renamed', phone: '+91 90000 00000', qualification: 'M.Ed' },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ qualification: 'M.Ed', user: { fullName: 'IT Teacher Renamed', phone: '9000000000' } }); // STORED NORMALIZED (MIGRATION 15)

    const entries = await audit(people.t1.userId);
    const userUpdate = entries.find((e) => e.action === 'users.update');
    expect(userUpdate).toMatchObject({ actorUserId: itAdmin.userId, oldData: null, newData: null });
    expect(userUpdate.metadata.changedFields).toEqual(['fullName', 'phone']);
    expect(JSON.stringify(entries)).not.toContain('90000');
  });

  it('a failed update changes nothing (both tables roll back together)', async () => {
    const result = await api(adminSession, teacherById.PATCH, 'PATCH', `/api/teachers/${people.t1.id}`, {
      params: { id: people.t1.id },
      body: { fullName: 'Should Not Persist', employeeCode: testCode('t2') }, // employeeCode clashes
    });
    expect(result.status).toBe(409);
    const { rows } = await db.query('select "fullName" from public.users where id = $1', [people.t1.userId]);
    expect(rows[0].fullName).toBe('IT Teacher Renamed');
  });

  it('returns 404 for unknown teachers and 403 for teachers editing', async () => {
    expect((await api(adminSession, teacherById.PATCH, 'PATCH', `/api/teachers/${MISSING}`, { params: { id: MISSING }, body: { qualification: 'x' } })).status).toBe(404);
    expect((await api(people.t1.session!, teacherById.PATCH, 'PATCH', `/api/teachers/${people.t1.id}`, { params: { id: people.t1.id }, body: { qualification: 'x' } })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------

describe('teacher assignments', () => {
  let assignmentId: string;

  it('admin assigns a teacher to a class + subject; duplicates are 409; audited', async () => {
    const result = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t1.id, classId: classA, subjectId },
    });
    expect(result.status).toBe(201);
    assignmentId = result.body.data.id;
    track('teacherAssignments', assignmentId);
    expect((await audit(assignmentId)).map((a) => [a.action, a.actorUserId])).toEqual([['teacherAssignments.insert', itAdmin.userId]]);

    const dup = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t1.id, classId: classA, subjectId },
    });
    expect(dup.status).toBe(409);
  });

  it('rejects invalid references (422)', async () => {
    const noSubject = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t1.id, classId: classA, subjectId: MISSING },
    });
    expect([noSubject.status, noSubject.body.error?.details?.[0]?.path]).toEqual([422, 'subjectId']);
    const noTeacher = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: MISSING, classId: classA, subjectId },
    });
    expect(noTeacher.status).toBe(422);
  });

  it('a teacher cannot assign themselves — not via the API, not via the Data API', async () => {
    const viaApi = await api(people.t1.session!, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t1.id, classId: classB, subjectId },
    });
    expect(viaApi.status).toBe(403);

    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: people.t1.email, password: people.t1.password });
    const { error } = await client.from('teacherAssignments').insert({ teacherId: people.t1.id, classId: classB, subjectId });
    expect(error?.code).toBe('42501');
  });

  it('teachers see only their own assignments', async () => {
    const list = await api(people.t1.session!, assignments.GET, 'GET', `/api/teacher-assignments?classId=${classA}`);
    expect(list.body.data.items.map((a: { id: string }) => a.id)).toEqual([assignmentId]);
    people.t2.session = await signIn(harness, people.t2.email, people.t2.password);
    const t2 = await api(people.t2.session, assignments.GET, 'GET', `/api/teacher-assignments?classId=${classA}`);
    expect(t2.body.data.items).toEqual([]);
  });

  it('an assignment used by a timetable cannot be removed (409); otherwise admins can remove it', async () => {
    const extra = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t2.id, classId: classB, subjectId },
    });
    const extraId = extra.body.data.id;
    track('teacherAssignments', extraId);
    const entry = await db.query(
      'insert into public."timetableEntries" ("classId", "subjectId", "teacherId", "dayOfWeek", "startTime", "endTime") values ($1, $2, $3, 1, \'09:00\', \'09:45\') returning id',
      [classB, subjectId, people.t2.id],
    );
    try {
      const blocked = await api(adminSession, assignmentById.DELETE, 'DELETE', `/api/teacher-assignments/${extraId}`, { params: { id: extraId } });
      expect([blocked.status, blocked.body.error?.message]).toEqual([409, 'This assignment is used by timetable entries and cannot be removed.']);
    } finally {
      await db.query('delete from public."timetableEntries" where id = $1', [entry.rows[0].id]);
    }

    expect((await api(people.t2.session!, assignmentById.DELETE, 'DELETE', `/api/teacher-assignments/${extraId}`, { params: { id: extraId } })).status).toBe(403);
    const removed = await api(adminSession, assignmentById.DELETE, 'DELETE', `/api/teacher-assignments/${extraId}`, { params: { id: extraId } });
    expect([removed.status, removed.body.data.id]).toEqual([200, extraId]);
    expect((await audit(extraId)).map((a) => a.action)).toEqual(['teacherAssignments.insert', 'teacherAssignments.delete']);
    expect((await api(adminSession, assignmentById.DELETE, 'DELETE', `/api/teacher-assignments/${extraId}`, { params: { id: extraId } })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------

describe('student management', () => {
  it('admin creates students through provisioning (no password: they sign in with the admission number)', async () => {
    for (const label of ['s1', 's2', 's3']) {
      const email = testEmail(label);
      const result = await api(adminSession, students.POST, 'POST', '/api/students', {
        body: { email, fullName: `IT Student ${label}`, admissionNumber: testCode(label), dateOfBirth: '2012-01-15' },
      });
      expect(result.status).toBe(201);
      expect(result.body.data).toMatchObject({ admissionNumber: testCode(label), user: { email, isActive: true } });
      await trackAccount(email);
      people[label] = { email, password: '', userId: result.body.data.userId, id: result.body.data.id };
    }
  });

  it('a duplicate admission number is 409 and the new Auth user is removed again', async () => {
    const email = testEmail('s-dup');
    const result = await api(adminSession, students.POST, 'POST', '/api/students', {
      body: { email, fullName: 'Dup', admissionNumber: testCode('s1') },
    });
    expect(result.status).toBe(409);
    expect(await authIdFor(email)).toBeNull();
  });

  it("admin updates a student's profile; teachers and students cannot", async () => {
    const updated = await api(adminSession, studentById.PATCH, 'PATCH', `/api/students/${people.s1.id}`, {
      params: { id: people.s1.id },
      body: { address: '1 IT Street', fatherName: 'IT Parent' },
    });
    expect(updated.body.data).toMatchObject({ address: '1 IT Street', fatherName: 'IT Parent' });
    expect((await audit(people.s1.id)).at(-1)).toMatchObject({
      action: 'students.update',
      oldData: null,
      newData: null,
      metadata: { changedFields: ['address', 'fatherName'] },
    });
    expect((await api(people.t1.session!, studentById.PATCH, 'PATCH', `/api/students/${people.s1.id}`, { params: { id: people.s1.id }, body: { address: 'x' } })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------

describe('student enrollments', () => {
  let e1: string;
  let e2: string;

  it('admin enrolls students; the academic year comes from the class', async () => {
    const one = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', {
      body: { studentId: people.s1.id, classId: classA, rollNumber: 1 },
    });
    expect(one.status).toBe(201);
    expect(one.body.data).toMatchObject({ studentId: people.s1.id, classId: classA, academicYearId: yearId, rollNumber: 1 });
    e1 = one.body.data.id;
    track('studentEnrollments', e1);

    const two = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', {
      body: { studentId: people.s2.id, classId: classB, rollNumber: 1 },
    });
    e2 = two.body.data.id;
    track('studentEnrollments', e2);
    expect((await audit(e1)).map((a) => [a.action, a.actorUserId])).toEqual([['studentEnrollments.insert', itAdmin.userId]]);
  });

  it('rejects a second class in the same year, a taken roll number, and bad references', async () => {
    const sameYear = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: people.s1.id, classId: classB } });
    expect([sameYear.status, sameYear.body.error?.message]).toEqual([409, 'This student is already enrolled in a class for that academic year.']);

    const roll = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: people.s3.id, classId: classA, rollNumber: 1 } });
    expect([roll.status, roll.body.error?.message]).toEqual([409, 'This roll number is already used in the class.']);

    const noClass = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: people.s3.id, classId: MISSING } });
    expect([noClass.status, noClass.body.error?.details?.[0]?.path]).toEqual([422, 'classId']);
    const noStudent = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: MISSING, classId: classA } });
    expect([noStudent.status, noStudent.body.error?.details?.[0]?.path]).toEqual([422, 'studentId']);
    expect((await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: 'x', classId: classA } })).status).toBe(422);
  });

  it("preserves history: earlier years' enrollments remain alongside the current one", async () => {
    const old = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: people.s1.id, classId: classOtherYear } });
    expect(old.status).toBe(201);
    track('studentEnrollments', old.body.data.id);
    const history = await api(adminSession, enrollments.GET, 'GET', `/api/enrollments?studentId=${people.s1.id}`);
    expect(history.body.data.items.map((e: { academicYearId: string }) => e.academicYearId).sort()).toEqual([otherYearId, yearId].sort());
  });

  it('moves a student within the same year only', async () => {
    const crossYear = await api(adminSession, enrollmentById.PATCH, 'PATCH', `/api/enrollments/${e2}`, { params: { id: e2 }, body: { classId: classOtherYear } });
    expect(crossYear.status).toBe(422);
    const moved = await api(adminSession, enrollmentById.PATCH, 'PATCH', `/api/enrollments/${e2}`, { params: { id: e2 }, body: { classId: classA, rollNumber: 2 } });
    expect(moved.body.data).toMatchObject({ classId: classA, rollNumber: 2 });
    const back = await api(adminSession, enrollmentById.PATCH, 'PATCH', `/api/enrollments/${e2}`, { params: { id: e2 }, body: { classId: classB, rollNumber: 1 } });
    expect(back.status).toBe(200);
  });

  it('refuses to move a student whose enrollment already has attendance (history protected, 409)', async () => {
    const attendance = await db.query(
      'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2016-06-01\', \'present\', $3) returning id',
      [people.s2.id, classB, itAdmin.userId],
    );
    try {
      const blocked = await api(adminSession, enrollmentById.PATCH, 'PATCH', `/api/enrollments/${e2}`, { params: { id: e2 }, body: { classId: classA } });
      expect(blocked.status).toBe(409);
      const { rows } = await db.query('select "classId" from public."studentEnrollments" where id = $1', [e2]);
      expect(rows[0].classId).toBe(classB);
    } finally {
      await db.query('delete from public."studentAttendance" where id = $1', [attendance.rows[0].id]);
    }
  });

  it('refuses to enroll a deactivated student', async () => {
    const off = await api(adminSession, deactivate, 'POST', `/api/users/${people.s3.userId}/deactivate`, { params: { id: people.s3.userId } });
    expect(off.body.data.isActive).toBe(false);
    const result = await api(adminSession, enrollments.POST, 'POST', '/api/enrollments', { body: { studentId: people.s3.id, classId: classA } });
    expect([result.status, result.body.error?.details?.[0]?.message]).toEqual([422, "The student's account is deactivated."]);
  });

  it('enrollments cannot be deleted through the API (history)', async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: itAdmin.email, password: itAdmin.password });
    const { error } = await client.from('studentEnrollments').delete().eq('id', e1);
    expect(error?.code).toBe('42501');
  });
});

// ---------------------------------------------------------------------------------

describe('scoped access to students and enrollments', () => {
  // t1 teaches class 7-A; s1 is in 7-A; s2 is in 7-B.

  it('a teacher sees only the students and enrollments of classes they teach', async () => {
    const list = await api(people.t1.session!, students.GET, 'GET', `/api/students?limit=100&classId=${classA}`);
    expect(list.body.data.items.map((s: { id: string }) => s.id)).toEqual([people.s1.id]);
    const all = await api(people.t1.session!, students.GET, 'GET', '/api/students?limit=100');
    const ids = all.body.data.items.map((s: { id: string }) => s.id);
    expect(ids).toContain(people.s1.id);
    expect(ids).not.toContain(people.s2.id);

    expect((await api(people.t1.session!, studentById.GET, 'GET', `/api/students/${people.s2.id}`, { params: { id: people.s2.id } })).status).toBe(404);
    const classB_enrollments = await api(people.t1.session!, enrollments.GET, 'GET', `/api/enrollments?classId=${classB}`);
    expect(classB_enrollments.body.data.items).toEqual([]);
  });

  it('a student sees only their own record and enrollments', async () => {
    people.s1.session = await signInAsStudent(harness, testCode('s1'));
    const own = await api(people.s1.session, studentById.GET, 'GET', `/api/students/${people.s1.id}`, { params: { id: people.s1.id } });
    expect(own.body.data.id).toBe(people.s1.id);
    expect((await api(people.s1.session, studentById.GET, 'GET', `/api/students/${people.s2.id}`, { params: { id: people.s2.id } })).status).toBe(403);
    expect((await api(people.s1.session, students.GET, 'GET', '/api/students')).status).toBe(403);

    const mine = await api(people.s1.session, enrollments.GET, 'GET', '/api/enrollments?limit=100');
    expect(new Set(mine.body.data.items.map((e: { studentId: string }) => e.studentId))).toEqual(new Set([people.s1.id]));
    expect((await api(people.s1.session, enrollments.GET, 'GET', `/api/enrollments?studentId=${people.s2.id}`)).status).toBe(403);
  });

  it('a student cannot read teacher records', async () => {
    expect((await api(people.s1.session!, teacherById.GET, 'GET', `/api/teachers/${people.t1.id}`, { params: { id: people.t1.id } })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------

describe('deactivating a teacher with history', () => {
  it('keeps their assignments and profile, and blocks their existing session', async () => {
    const off = await api(adminSession, deactivate, 'POST', `/api/users/${people.t1.userId}/deactivate`, { params: { id: people.t1.userId } });
    expect(off.body.data).toMatchObject({ isActive: false, changed: true });

    expect((await api(people.t1.session!, teacherById.GET, 'GET', `/api/teachers/${people.t1.id}`, { params: { id: people.t1.id } })).status).toBe(401);

    const { rows } = await db.query(
      `select (select count(*) from public."teacherAssignments" where "teacherId" = $1)::int as assignments,
              (select count(*) from public.teachers where id = $1)::int as profiles`,
      [people.t1.id],
    );
    expect(rows[0]).toEqual({ assignments: 1, profiles: 1 });

    const inactive = await api(adminSession, teachers.GET, 'GET', '/api/teachers?isActive=false&limit=100');
    expect(inactive.body.data.items.map((t: { id: string }) => t.id)).toContain(people.t1.id);
    const active = await api(adminSession, teachers.GET, 'GET', '/api/teachers?isActive=true&limit=100');
    expect(active.body.data.items.map((t: { id: string }) => t.id)).not.toContain(people.t1.id);

    const reassign = await api(adminSession, assignments.POST, 'POST', '/api/teacher-assignments', {
      body: { teacherId: people.t1.id, classId: classB, subjectId },
    });
    expect(reassign.status).toBe(422);
  });
});
