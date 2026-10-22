import { ensureItAdmin, ensureItTeacher, teardown, testCode, testEmail, testPassword, testPhone, track } from './helpers/actors';
import type { TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';
import type { CookieStore } from './helpers/http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import type pg from 'pg';

/**
 * REAL-SUPABASE TESTS FOR THE THREE SEPARATE SIGN-INS (MIGRATION 15):
 *   ADMINISTRATORS  EMAIL + PASSWORD, NO SIGN-UP;
 *   TEACHERS        PHONE NUMBER + PASSWORD, WITH A ONE-TIME SIGN-UP AND AN ADMIN RESET;
 *   STUDENTS        ADMISSION NUMBER ONLY.
 * EVERY ACCOUNT IS UNIQUE TO THIS RUN AND REMOVED AFTERWARDS.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as teachers from '@/app/api/teachers/route';
import * as teacherOne from '@/app/api/teachers/[id]/route';
import * as students from '@/app/api/students/route';
import { POST as adminLogin } from '@/app/api/auth/admin/login/route';
import { POST as teacherLogin } from '@/app/api/auth/teacher/login/route';
import { POST as teacherSignUp } from '@/app/api/auth/teacher/sign-up/route';
import { POST as studentLogin } from '@/app/api/auth/student/login/route';
import { POST as resetSignUp } from '@/app/api/users/[id]/reset-sign-up/route';
import { POST as deactivate } from '@/app/api/users/[id]/deactivate/route';
import { POST as reactivate } from '@/app/api/users/[id]/reactivate/route';
import { GET as me } from '@/app/api/auth/me/route';

const harness = { state };

let db: pg.Client;
let itAdmin: TestAccount;
let itTeacher: TestAccount;
let adminSession: CookieStore;
let teacherSession: CookieStore;

const teacher = { email: testEmail('si-teacher'), phone: testPhone(), userId: '', id: '', password: testPassword() };
const raceTeacher = { email: testEmail('si-race'), phone: testPhone(), userId: '' };
const student = { email: testEmail('si-student'), admissionNumber: testCode('SI-ADM'), userId: '' };

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) => call(harness, as, handler, method, path, options);
const post = (as: CookieStore, handler: unknown, path: string, body: Record<string, unknown>) => api(as, handler, 'POST', path, { body });
const action = (as: CookieStore, handler: unknown, userId: string) => api(as, handler, 'POST', `/api/users/${userId}/x`, { params: { id: userId } });
/** "98765 43210" AS A TEACHER MIGHT TYPE IT: WITH +91, A SPACE AND A DASH. */
const typed = (phone: string) => `+91 ${phone.slice(0, 5)}-${phone.slice(5)}`;

async function trackAccount(email: string) {
  track('authUsers', (await createSupabaseAdminClient().rpc('findAuthUserIdByEmail', { email })).data);
}

async function createTeacher(account: { email: string; phone: string }, label: string) {
  const result = await post(adminSession, teachers.POST, '/api/teachers', { email: account.email, phone: account.phone, fullName: `IT ${label}`, employeeCode: testCode(label) });
  await trackAccount(account.email);
  expect(result.status).toBe(201);
  return result.body.data as { id: string; userId: string };
}

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  itTeacher = await ensureItTeacher();
  adminSession = await signIn(harness, itAdmin.email, itAdmin.password);
  teacherSession = await signIn(harness, itTeacher.email, itTeacher.password);

  const createdTeacher = await createTeacher(teacher, 'SI-T');
  teacher.id = createdTeacher.id;
  teacher.userId = createdTeacher.userId;
  raceTeacher.userId = (await createTeacher(raceTeacher, 'SI-R')).userId;
  const createdStudent = await post(adminSession, students.POST, '/api/students', { email: student.email, fullName: 'IT SI Student', admissionNumber: student.admissionNumber });
  await trackAccount(student.email);
  student.userId = createdStudent.body.data.userId;
});

afterAll(async () => {
  try {
    await teardown(itAdmin, itTeacher);
  } finally {
    await db?.end();
  }
});

describe('teacher phone numbers', () => {
  it('are stored normalized, unique among teachers, and in the right format', async () => {
    expect((await db.query('select phone from public.users where id = $1', [teacher.userId])).rows[0].phone).toBe(teacher.phone);
    const duplicate = await post(adminSession, teachers.POST, '/api/teachers', {
      email: testEmail('si-dup'),
      phone: typed(teacher.phone),
      fullName: 'IT Dup',
      employeeCode: testCode('SI-D'),
    });
    expect([duplicate.status, duplicate.body.error?.message]).toEqual([409, 'Another teacher already uses this phone number.']);
    expect((await db.query('select count(*)::int n from public.users where email = $1', [testEmail('si-dup')])).rows[0].n).toBe(0);

    const missing = await post(adminSession, teachers.POST, '/api/teachers', { email: testEmail('si-np'), fullName: 'X', employeeCode: testCode('SI-NP') });
    expect(missing.status).toBe(422);
    const patchToTaken = await api(adminSession, teacherOne.PATCH, 'PATCH', `/api/teachers/${teacher.id}`, { params: { id: teacher.id }, body: { phone: raceTeacher.phone } });
    expect(patchToTaken.status).toBe(409);
    const patchInvalid = await api(adminSession, teacherOne.PATCH, 'PATCH', `/api/teachers/${teacher.id}`, { params: { id: teacher.id }, body: { phone: '12345' } });
    expect(patchInvalid.status).toBe(422);
  });

  it('the database rejects a teacher number that is not normalized, even from the service role', async () => {
    await expect(db.query('update public.users set phone = $1 where id = $2', [typed(teacher.phone), teacher.userId])).rejects.toMatchObject({ code: '23514' });
  });
});

describe('POST /api/auth/teacher/sign-up', () => {
  it('cannot sign in before signing up', async () => {
    const result = await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password });
    expect(result.status).toBe(401);
  });

  it('answers an unregistered number with 404, and a short password with 422', async () => {
    const unknown = await post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: '6999999999', password: testPassword() });
    expect([unknown.status, unknown.body.error?.code]).toEqual([404, 'NOT_FOUND']);
    const short = await post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: teacher.phone, password: 'short' });
    expect(short.status).toBe(422);
    expect((await db.query('select "passwordSetAt" from public.users where id = $1', [teacher.userId])).rows[0].passwordSetAt).toBeNull();
  });

  it('sets the password and signs the teacher in, with the number as typed', async () => {
    const cookies = anonymous();
    const result = await post(cookies, teacherSignUp, '/api/auth/teacher/sign-up', { phone: typed(teacher.phone), password: teacher.password });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ isSignedIn: true, profile: { id: teacher.userId, role: 'TEACHER' } });
    expect((await api(cookies, me, 'GET', '/api/auth/me')).body.data).toMatchObject({ id: teacher.userId, role: 'TEACHER' });
    expect((await db.query('select "passwordSetAt" from public.users where id = $1', [teacher.userId])).rows[0].passwordSetAt).not.toBeNull();
    const audit = await db.query('select "actorUserId", metadata from public."auditLogs" where "entityId" = $1 and action = $2', [teacher.userId, 'users.teacherSignUp']);
    expect(audit.rows).toEqual([{ actorUserId: null, metadata: { selfService: true } }]);
  });

  it('works only once (409)', async () => {
    const again = await post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: teacher.phone, password: testPassword() });
    expect([again.status, again.body.error?.code]).toEqual([409, 'CONFLICT']);
    // THE FIRST PASSWORD STILL WORKS.
    expect((await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password })).status).toBe(200);
  });

  it('lets exactly one of two simultaneous sign-ups for the same number win', async () => {
    const [first, second] = await Promise.all([
      post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: raceTeacher.phone, password: testPassword() }),
      post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: raceTeacher.phone, password: testPassword() }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });
});

describe('POST /api/auth/teacher/login', () => {
  it('signs in with the number (any common format) and password', async () => {
    const cookies = anonymous();
    const result = await post(cookies, teacherLogin, '/api/auth/teacher/login', { phone: `0${teacher.phone}`, password: teacher.password });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ id: teacher.userId, role: 'TEACHER', email: teacher.email });
  });

  it('gives a wrong password and an unknown number the same 401', async () => {
    const wrong = await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: 'Wrong-password-123' });
    const unknown = await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: '6999999999', password: teacher.password });
    for (const result of [wrong, unknown]) {
      expect(result.body).toEqual({ data: null, error: { code: 'INVALID_CREDENTIALS', message: 'The phone number or password is incorrect.' } });
    }
  });

  it("refuses the teacher's email and password on the administrator sign-in", async () => {
    const result = await post(anonymous(), adminLogin, '/api/auth/admin/login', { email: teacher.email, password: teacher.password });
    expect(result.status).toBe(401);
  });
});

describe('POST /api/users/{id}/reset-sign-up', () => {
  it('ends their sessions, retires the old password, and lets the teacher sign up again', async () => {
    const session = anonymous();
    expect((await post(session, teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password })).status).toBe(200);

    const reset = await action(adminSession, resetSignUp, teacher.userId);
    expect(reset.status).toBe(200);
    expect(reset.body.data.revokedSessions).toBeGreaterThan(0);
    expect((await api(session, me, 'GET', '/api/auth/me')).status).toBe(401);
    expect((await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password })).status).toBe(401);

    teacher.password = testPassword();
    expect((await post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: teacher.phone, password: teacher.password })).status).toBe(200);
    expect((await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password })).status).toBe(200);
  });

  it('is for teachers only, by administrators only', async () => {
    expect((await action(adminSession, resetSignUp, student.userId)).status).toBe(403);
    expect((await action(adminSession, resetSignUp, itAdmin.userId)).status).toBe(403);
    expect((await action(teacherSession, resetSignUp, teacher.userId)).status).toBe(403);
    expect((await action(anonymous(), resetSignUp, teacher.userId)).status).toBe(401);
  });
});

describe('deactivated teachers', () => {
  it('can neither sign in nor sign up', async () => {
    expect((await action(adminSession, deactivate, teacher.userId)).status).toBe(200);
    const login = await post(anonymous(), teacherLogin, '/api/auth/teacher/login', { phone: teacher.phone, password: teacher.password });
    expect([login.status, login.body.error?.code]).toEqual([403, 'ACCOUNT_INACTIVE']);
    expect((await action(adminSession, resetSignUp, teacher.userId)).status).toBe(409);

    await db.query('update public.users set "passwordSetAt" = null where id = $1', [teacher.userId]);
    const signUp = await post(anonymous(), teacherSignUp, '/api/auth/teacher/sign-up', { phone: teacher.phone, password: testPassword() });
    expect([signUp.status, signUp.body.error?.code]).toEqual([403, 'ACCOUNT_INACTIVE']);
    expect((await db.query('select "passwordSetAt" from public.users where id = $1', [teacher.userId])).rows[0].passwordSetAt).toBeNull();
    await action(adminSession, reactivate, teacher.userId);
  });
});

describe('POST /api/auth/student/login', () => {
  it('signs the student in with the admission number alone', async () => {
    const cookies = anonymous();
    const result = await post(cookies, studentLogin, '/api/auth/student/login', { admissionNumber: `  ${student.admissionNumber} ` });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ id: student.userId, role: 'STUDENT', fullName: 'IT SI Student' });
    expect((await api(cookies, me, 'GET', '/api/auth/me')).body.data.role).toBe('STUDENT');
  });

  it('answers an unknown admission number with 401, and anything else in the body with 422', async () => {
    const unknown = await post(anonymous(), studentLogin, '/api/auth/student/login', { admissionNumber: testCode('SI-NOBODY') });
    expect([unknown.status, unknown.body.error?.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    expect((await post(anonymous(), studentLogin, '/api/auth/student/login', { email: student.email })).status).toBe(422);
  });

  it('refuses a deactivated student, and lets them back in after reactivation', async () => {
    await action(adminSession, deactivate, student.userId);
    const refused = await post(anonymous(), studentLogin, '/api/auth/student/login', { admissionNumber: student.admissionNumber });
    expect([refused.status, refused.body.error?.code]).toEqual([403, 'ACCOUNT_INACTIVE']);
    await action(adminSession, reactivate, student.userId);
    expect((await post(anonymous(), studentLogin, '/api/auth/student/login', { admissionNumber: student.admissionNumber })).status).toBe(200);
  });
});
