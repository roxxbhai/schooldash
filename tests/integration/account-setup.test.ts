import { ensureItAdmin, ensureItTeacher, teardown, testCode, testEmail, testPassword, track } from './helpers/actors';
import type { TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';
import type { CookieStore } from './helpers/http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import { hashSetupCode, normalizeSetupCode } from '@/helpers/account-setup';
import type pg from 'pg';

/**
 * REAL-SUPABASE TESTS FOR MIGRATION 13: ADMIN-ISSUED ACCOUNT SETUP CODES,
 * PEOPLE SEARCH, AND THE NAME AND EMAIL IN THE SESSION PROFILE.
 * EVERY ACCOUNT IS UNIQUE TO THIS RUN AND REMOVED AFTERWARDS.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as teachers from '@/app/api/teachers/route';
import * as students from '@/app/api/students/route';
import { POST as setup } from '@/app/api/auth/setup/route';
import { POST as issueCode } from '@/app/api/users/[id]/setup-code/route';
import { POST as deactivate } from '@/app/api/users/[id]/deactivate/route';
import { POST as reactivate } from '@/app/api/users/[id]/reactivate/route';
import { GET as me } from '@/app/api/auth/me/route';

const harness = { state };
const INVALID_MESSAGE = 'The email or setup code is incorrect, or the code has expired.';
const CODE_FORMAT = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

let db: pg.Client;
let itAdmin: TestAccount;
let itTeacher: TestAccount;
let adminSession: CookieStore;
let teacherSession: CookieStore;

const teacher = { email: testEmail('setup-teacher'), userId: '', code: '' };
const student = { email: testEmail('setup-student'), userId: '', code: '', admissionNumber: testCode('SETUP-ADM') };

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) => call(harness, as, handler, method, path, options);
const setupAs = (body: Record<string, unknown>, headers?: Record<string, string>) =>
  api(anonymous(), setup, 'POST', '/api/auth/setup', { body, headers });
const issueFor = (as: CookieStore, userId: string) =>
  api(as, issueCode, 'POST', `/api/users/${userId}/setup-code`, { params: { id: userId } });

async function trackAccount(email: string) {
  track('authUsers', (await createSupabaseAdminClient().rpc('findAuthUserIdByEmail', { email })).data);
}

async function storedCode(userId: string) {
  return (await db.query('select "codeHash", "failedAttempts", "expiresAt", "issuedByUserId" from public."accountSetupCodes" where "userId" = $1', [userId])).rows[0];
}

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  itTeacher = await ensureItTeacher();
  adminSession = await signIn(harness, itAdmin.email, itAdmin.password);
  teacherSession = await signIn(harness, itTeacher.email, itTeacher.password);
});

afterAll(async () => {
  try {
    await teardown(itAdmin, itTeacher);
  } finally {
    await db?.end();
  }
});

describe('creating people without a password issues a setup code', () => {
  it('returns a formatted one-time code for a new teacher, and stores only its hash', async () => {
    const result = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email: teacher.email, fullName: 'IT Setup Teacher', employeeCode: testCode('SETUP-T') },
    });
    await trackAccount(teacher.email);
    expect(result.status).toBe(201);
    expect(result.body.data.setupCode).toEqual({ code: expect.stringMatching(CODE_FORMAT), expiresAt: expect.any(String) });
    teacher.userId = result.body.data.userId;
    teacher.code = result.body.data.setupCode.code;

    const stored = await storedCode(teacher.userId);
    expect(stored.codeHash).toBe(hashSetupCode(normalizeSetupCode(teacher.code)));
    expect(stored.issuedByUserId).toBe(itAdmin.userId);
    expect(JSON.stringify(stored)).not.toContain(normalizeSetupCode(teacher.code));
    const days = (new Date(stored.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('also issues one for a new student, and audits the issue', async () => {
    const result = await api(adminSession, students.POST, 'POST', '/api/students', {
      body: { email: student.email, fullName: 'IT Setup Student', admissionNumber: student.admissionNumber },
    });
    await trackAccount(student.email);
    expect(result.status).toBe(201);
    expect(result.body.data.setupCode.code).toMatch(CODE_FORMAT);
    student.userId = result.body.data.userId;
    student.code = result.body.data.setupCode.code;
    const audit = await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by "createdAt"', [student.userId]);
    expect(audit.rows).toEqual([
      { action: 'users.provision', actorUserId: itAdmin.userId },
      { action: 'users.issueSetupCode', actorUserId: itAdmin.userId },
    ]);
  });

  it('issues no code when an initial password is given', async () => {
    const email = testEmail('setup-with-password');
    const result = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email, fullName: 'IT Password Teacher', employeeCode: testCode('SETUP-P'), password: testPassword() },
    });
    await trackAccount(email);
    expect(result.status).toBe(201);
    expect(result.body.data.setupCode).toBeNull();
    expect(await storedCode(result.body.data.userId)).toBeUndefined();
  });
});

describe('POST /api/auth/setup', () => {
  it('rejects unknown fields, missing fields and cross-site requests before touching the code', async () => {
    expect((await setupAs({ email: teacher.email, code: teacher.code, password: testPassword(), role: 'ADMIN' })).status).toBe(422);
    const short = await setupAs({ email: teacher.email, code: teacher.code, password: 'short' });
    expect(short.status).toBe(422);
    expect(short.body.error?.details).toEqual([{ path: 'password', message: 'Use at least 12 characters.' }]);
    expect((await setupAs({ email: teacher.email, code: teacher.code, password: testPassword() }, { origin: 'https://evil.example' })).body.error?.code).toBe('CSRF_REJECTED');
    expect((await storedCode(teacher.userId)).failedAttempts).toBe(0);
  });

  it('gives one message for an unknown email and for a wrong code', async () => {
    const unknown = await setupAs({ email: testEmail('nobody'), code: teacher.code, password: testPassword() });
    const wrong = await setupAs({ email: teacher.email, code: '0000-0000-0000', password: testPassword() });
    for (const result of [unknown, wrong]) {
      expect(result).toEqual({ status: 401, body: { data: null, error: { code: 'INVALID_SETUP_CODE', message: INVALID_MESSAGE } } });
    }
    expect((await storedCode(teacher.userId)).failedAttempts).toBe(1);
  });

  it('accepts the code as typed (lower case, spaces), sets the password and signs the teacher in', async () => {
    const password = testPassword();
    const cookies = anonymous();
    const typed = teacher.code.toLowerCase().replace(/-/g, ' ');
    const result = await api(cookies, setup, 'POST', '/api/auth/setup', { body: { email: teacher.email.toUpperCase(), code: typed, password } });
    expect(result).toEqual({
      status: 200,
      body: {
        data: { isSignedIn: true, profile: { id: teacher.userId, role: 'TEACHER', isActive: true, fullName: 'IT Setup Teacher', email: teacher.email } },
        error: null,
      },
    });
    expect((await api(cookies, me, 'GET', '/api/auth/me')).status).toBe(200);
    await expect(signIn(harness, teacher.email, password)).resolves.toBeDefined();
    expect(await storedCode(teacher.userId)).toBeUndefined();
  });

  it('is single use', async () => {
    const reused = await setupAs({ email: teacher.email, code: teacher.code, password: testPassword() });
    expect(reused.status).toBe(401);
  });

  it('rejects an expired code', async () => {
    await db.query('update public."accountSetupCodes" set "expiresAt" = now() - interval \'1 minute\' where "userId" = $1', [student.userId]);
    const result = await setupAs({ email: student.email, code: student.code, password: testPassword() });
    expect(result.body.error?.code).toBe('INVALID_SETUP_CODE');
    expect(await storedCode(student.userId)).toBeUndefined();
  });

  it('invalidates a code after five wrong guesses', async () => {
    const issued = await issueFor(adminSession, student.userId);
    expect(issued.status).toBe(201);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await setupAs({ email: student.email, code: '0000-0000-0000', password: testPassword() })).status).toBe(401);
    }
    expect(await storedCode(student.userId)).toBeUndefined();
    const correct = await setupAs({ email: student.email, code: issued.body.data.code, password: testPassword() });
    expect(correct.status).toBe(401);
  });

  it('refuses a deactivated account even with a valid code, and keeps the code', async () => {
    const issued = await issueFor(adminSession, student.userId);
    await api(adminSession, deactivate, 'POST', `/api/users/${student.userId}/deactivate`, { params: { id: student.userId } });
    const result = await setupAs({ email: student.email, code: issued.body.data.code, password: testPassword() });
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe('ACCOUNT_INACTIVE');
    expect(await storedCode(student.userId)).toBeDefined();

    await api(adminSession, reactivate, 'POST', `/api/users/${student.userId}/reactivate`, { params: { id: student.userId } });
    const afterReactivation = await setupAs({ email: student.email, code: issued.body.data.code, password: testPassword() });
    expect(afterReactivation.body.data).toMatchObject({ isSignedIn: true, profile: { role: 'STUDENT' } });
  });
});

describe('POST /api/users/{id}/setup-code', () => {
  it('reissues a code that replaces the previous one, and works as a password reset', async () => {
    const first = await issueFor(adminSession, teacher.userId);
    const second = await issueFor(adminSession, teacher.userId);
    expect(second.status).toBe(201);
    expect(second.body.data.code).not.toBe(first.body.data.code);
    expect((await setupAs({ email: teacher.email, code: first.body.data.code, password: testPassword() })).status).toBe(401);
    const password = testPassword();
    expect((await setupAs({ email: teacher.email, code: second.body.data.code, password })).status).toBe(200);
    await expect(signIn(harness, teacher.email, password)).resolves.toBeDefined();
  });

  it('refuses admin accounts (403), deactivated accounts (409) and unknown users (404)', async () => {
    expect((await issueFor(adminSession, itAdmin.userId)).status).toBe(403);
    await api(adminSession, deactivate, 'POST', `/api/users/${student.userId}/deactivate`, { params: { id: student.userId } });
    const inactive = await issueFor(adminSession, student.userId);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error?.message).toBe('This account is deactivated. Reactivate it before issuing a setup code.');
    await api(adminSession, reactivate, 'POST', `/api/users/${student.userId}/reactivate`, { params: { id: student.userId } });
    expect((await issueFor(adminSession, '00000000-0000-4000-8000-00000000dead')).status).toBe(404);
  });

  it('is admin only, and same-origin only', async () => {
    expect((await issueFor(anonymous(), teacher.userId)).status).toBe(401);
    expect((await issueFor(teacherSession, teacher.userId)).status).toBe(403);
    const crossSite = await api(adminSession, issueCode, 'POST', `/api/users/${teacher.userId}/setup-code`, {
      params: { id: teacher.userId },
      headers: { origin: 'https://evil.example' },
    });
    expect(crossSite.body.error?.code).toBe('CSRF_REJECTED');
  });
});

describe('the setup codes table is unreachable through the Data API', () => {
  it.each(['anon', 'authenticated'])('%s cannot read it or call its functions', async (role) => {
    await db.query('begin');
    try {
      await db.query(`set local role ${role}`);
      await expect(db.query('select 1 from public."accountSetupCodes"')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.query('rollback');
    }
    for (const sql of [
      'select public."consumeAccountSetupCode"(\'x@example.com\', repeat(\'0\', 64))',
      'select public."issueAccountSetupCode"(gen_random_uuid(), repeat(\'0\', 64), now(), null)',
    ]) {
      await db.query('begin');
      try {
        await db.query(`set local role ${role}`);
        await expect(db.query(sql)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await db.query('rollback');
      }
    }
  });
});

describe('people search', () => {
  it('finds a student by admission number, name or email; others are excluded', async () => {
    for (const term of [student.admissionNumber.slice(-8), 'IT Setup Student', student.email.split('@')[0]]) {
      const result = await api(adminSession, students.GET, 'GET', `/api/students?search=${encodeURIComponent(term)}`);
      expect(result.status, term).toBe(200);
      expect(result.body.data.items.map((s: { userId: string }) => s.userId), term).toContain(student.userId);
      expect(result.body.data.items.every((s: { userId: string }) => s.userId !== teacher.userId)).toBe(true);
    }
    const none = await api(adminSession, students.GET, 'GET', `/api/students?search=${encodeURIComponent(testCode('nomatch'))}`);
    expect(none.body.data).toMatchObject({ items: [], pagination: { total: 0 } });
  });

  it('finds a teacher by employee code or name, combined with the status filter', async () => {
    const byCode = await api(adminSession, teachers.GET, 'GET', `/api/teachers?search=${encodeURIComponent(testCode('SETUP-T'))}&isActive=true`);
    expect(byCode.body.data.items.map((t: { userId: string }) => t.userId)).toEqual([teacher.userId]);
    const byName = await api(adminSession, teachers.GET, 'GET', '/api/teachers?search=setup%20teacher');
    expect(byName.body.data.items.map((t: { userId: string }) => t.userId)).toContain(teacher.userId);
  });

  it('rejects filter syntax in the search term (400)', async () => {
    for (const term of ['a,b', 'x)', 'a*', '%']) {
      expect((await api(adminSession, students.GET, 'GET', `/api/students?search=${encodeURIComponent(term)}`)).status, term).toBe(400);
    }
  });
});
