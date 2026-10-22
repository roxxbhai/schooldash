import { ensureItAdmin, ensureItTeacher, teardown, testCode, testEmail, testPassword, testPhone, track } from './helpers/actors';
import type { TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';
import type { CookieStore } from './helpers/http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import { hashSetupCode, normalizeSetupCode } from '@/helpers/account-setup';
import type pg from 'pg';

/**
 * REAL-SUPABASE TESTS FOR ADMIN-ISSUED SETUP CODES (MIGRATIONS 13 AND 15: ADMINISTRATORS
 * ONLY), THE ADMINISTRATORS API, AND PEOPLE SEARCH. EVERY ACCOUNT IS UNIQUE TO THIS RUN
 * AND REMOVED AFTERWARDS.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as admins from '@/app/api/admins/route';
import * as teachers from '@/app/api/teachers/route';
import * as students from '@/app/api/students/route';
import { POST as setup } from '@/app/api/auth/admin/setup/route';
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

const newAdmin = { email: testEmail('setup-admin'), userId: '', code: '' };
const otherAdmin = { email: testEmail('setup-admin-2'), userId: '', code: '' };
const teacher = { email: testEmail('setup-teacher'), phone: testPhone(), userId: '' };
const student = { email: testEmail('setup-student'), userId: '', admissionNumber: testCode('SETUP-ADM') };

const api = (as: CookieStore, handler: unknown, method: string, path: string, options = {}) => call(harness, as, handler, method, path, options);
const setupAs = (body: Record<string, unknown>, headers?: Record<string, string>) =>
  api(anonymous(), setup, 'POST', '/api/auth/admin/setup', { body, headers });
const issueFor = (as: CookieStore, userId: string) =>
  api(as, issueCode, 'POST', `/api/users/${userId}/setup-code`, { params: { id: userId } });
const setStatus = (handler: unknown, userId: string) => api(adminSession, handler, 'POST', `/api/users/${userId}/x`, { params: { id: userId } });

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

describe('POST /api/admins: administrators add administrators', () => {
  it('creates an administrator without a password and returns a one-time code, storing only its hash', async () => {
    const result = await api(adminSession, admins.POST, 'POST', '/api/admins', { body: { email: newAdmin.email.toUpperCase(), fullName: 'IT Setup Admin' } });
    await trackAccount(newAdmin.email);
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ email: newAdmin.email, fullName: 'IT Setup Admin', isActive: true, passwordSetAt: null });
    expect(result.body.data.setupCode).toEqual({ code: expect.stringMatching(CODE_FORMAT), expiresAt: expect.any(String) });
    newAdmin.userId = result.body.data.id;
    newAdmin.code = result.body.data.setupCode.code;

    const stored = await storedCode(newAdmin.userId);
    expect(stored.codeHash).toBe(hashSetupCode(normalizeSetupCode(newAdmin.code)));
    expect(stored.issuedByUserId).toBe(itAdmin.userId);
    expect(JSON.stringify(stored)).not.toContain(normalizeSetupCode(newAdmin.code));
    const days = (new Date(stored.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    const audit = await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by "createdAt"', [newAdmin.userId]);
    expect(audit.rows).toEqual([
      { action: 'users.provision', actorUserId: itAdmin.userId },
      { action: 'users.issueSetupCode', actorUserId: itAdmin.userId },
    ]);
  });

  it('lists administrators for admins only, and refuses a role or extra fields in the body', async () => {
    const list = await api(adminSession, admins.GET, 'GET', '/api/admins?limit=100');
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining([itAdmin.userId, newAdmin.userId]));
    expect(list.body.data.items.every((a: Record<string, unknown>) => !('role' in a) && !('authUserId' in a))).toBe(true);
    expect((await api(teacherSession, admins.GET, 'GET', '/api/admins')).status).toBe(403);
    expect((await api(anonymous(), admins.GET, 'GET', '/api/admins')).status).toBe(401);
    expect((await api(teacherSession, admins.POST, 'POST', '/api/admins', { body: { email: testEmail('x'), fullName: 'X' } })).status).toBe(403);
    expect((await api(adminSession, admins.POST, 'POST', '/api/admins', { body: { email: testEmail('x'), fullName: 'X', password: testPassword() } })).status).toBe(422);
  });

  it('teachers and students are created without any setup code', async () => {
    const createdTeacher = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email: teacher.email, phone: teacher.phone, fullName: 'IT Setup Teacher', employeeCode: testCode('SETUP-T') },
    });
    await trackAccount(teacher.email);
    expect(createdTeacher.status).toBe(201);
    expect(createdTeacher.body.data).not.toHaveProperty('setupCode');
    expect(createdTeacher.body.data.user).toMatchObject({ phone: teacher.phone, passwordSetAt: null });
    teacher.userId = createdTeacher.body.data.userId;

    const createdStudent = await api(adminSession, students.POST, 'POST', '/api/students', {
      body: { email: student.email, fullName: 'IT Setup Student', admissionNumber: student.admissionNumber },
    });
    await trackAccount(student.email);
    expect(createdStudent.status).toBe(201);
    expect(createdStudent.body.data).not.toHaveProperty('setupCode');
    student.userId = createdStudent.body.data.userId;

    for (const userId of [teacher.userId, student.userId]) expect(await storedCode(userId)).toBeUndefined();
    // NO INITIAL PASSWORDS FOR TEACHERS OR STUDENTS ANY MORE.
    const withPassword = await api(adminSession, teachers.POST, 'POST', '/api/teachers', {
      body: { email: testEmail('x2'), phone: testPhone(), fullName: 'X', employeeCode: testCode('X2'), password: testPassword() },
    });
    expect(withPassword.status).toBe(422);
  });
});

describe('POST /api/auth/admin/setup', () => {
  it('rejects unknown fields, missing fields and cross-site requests before touching the code', async () => {
    expect((await setupAs({ email: newAdmin.email, code: newAdmin.code, password: testPassword(), role: 'ADMIN' })).status).toBe(422);
    const short = await setupAs({ email: newAdmin.email, code: newAdmin.code, password: 'short' });
    expect(short.status).toBe(422);
    expect(short.body.error?.details).toEqual([{ path: 'password', message: 'Use at least 12 characters.' }]);
    expect((await setupAs({ email: newAdmin.email, code: newAdmin.code, password: testPassword() }, { origin: 'https://evil.example' })).body.error?.code).toBe('CSRF_REJECTED');
    expect((await storedCode(newAdmin.userId)).failedAttempts).toBe(0);
  });

  it('gives one message for an unknown email and for a wrong code', async () => {
    const unknown = await setupAs({ email: testEmail('nobody'), code: newAdmin.code, password: testPassword() });
    const wrong = await setupAs({ email: newAdmin.email, code: '0000-0000-0000', password: testPassword() });
    for (const result of [unknown, wrong]) {
      expect(result).toEqual({ status: 401, body: { data: null, error: { code: 'INVALID_SETUP_CODE', message: INVALID_MESSAGE } } });
    }
    expect((await storedCode(newAdmin.userId)).failedAttempts).toBe(1);
  });

  it('accepts the code as typed (lower case, spaces), sets the password and signs the administrator in', async () => {
    const password = testPassword();
    const cookies = anonymous();
    const typed = newAdmin.code.toLowerCase().replace(/-/g, ' ');
    const result = await api(cookies, setup, 'POST', '/api/auth/admin/setup', { body: { email: newAdmin.email.toUpperCase(), code: typed, password } });
    expect(result).toEqual({
      status: 200,
      body: {
        data: { isSignedIn: true, profile: { id: newAdmin.userId, role: 'ADMIN', isActive: true, fullName: 'IT Setup Admin', email: newAdmin.email } },
        error: null,
      },
    });
    expect((await api(cookies, me, 'GET', '/api/auth/me')).status).toBe(200);
    await expect(signIn(harness, newAdmin.email, password)).resolves.toBeDefined();
    expect(await storedCode(newAdmin.userId)).toBeUndefined();
    expect((await db.query('select "passwordSetAt" from public.users where id = $1', [newAdmin.userId])).rows[0].passwordSetAt).not.toBeNull();
  });

  it('is single use', async () => {
    const reused = await setupAs({ email: newAdmin.email, code: newAdmin.code, password: testPassword() });
    expect(reused.status).toBe(401);
  });

  it('rejects an expired code', async () => {
    const created = await api(adminSession, admins.POST, 'POST', '/api/admins', { body: { email: otherAdmin.email, fullName: 'IT Setup Admin Two' } });
    await trackAccount(otherAdmin.email);
    otherAdmin.userId = created.body.data.id;
    otherAdmin.code = created.body.data.setupCode.code;
    await db.query('update public."accountSetupCodes" set "expiresAt" = now() - interval \'1 minute\' where "userId" = $1', [otherAdmin.userId]);
    const result = await setupAs({ email: otherAdmin.email, code: otherAdmin.code, password: testPassword() });
    expect(result.body.error?.code).toBe('INVALID_SETUP_CODE');
    expect(await storedCode(otherAdmin.userId)).toBeUndefined();
  });

  it('invalidates a code after five wrong guesses', async () => {
    const issued = await issueFor(adminSession, otherAdmin.userId);
    expect(issued.status).toBe(201);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await setupAs({ email: otherAdmin.email, code: '0000-0000-0000', password: testPassword() })).status).toBe(401);
    }
    expect(await storedCode(otherAdmin.userId)).toBeUndefined();
    const correct = await setupAs({ email: otherAdmin.email, code: issued.body.data.code, password: testPassword() });
    expect(correct.status).toBe(401);
  });

  it('refuses a deactivated administrator even with a valid code, and keeps the code', async () => {
    const issued = await issueFor(adminSession, otherAdmin.userId);
    expect((await setStatus(deactivate, otherAdmin.userId)).status).toBe(200);
    const result = await setupAs({ email: otherAdmin.email, code: issued.body.data.code, password: testPassword() });
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe('ACCOUNT_INACTIVE');
    expect(await storedCode(otherAdmin.userId)).toBeDefined();

    await setStatus(reactivate, otherAdmin.userId);
    const afterReactivation = await setupAs({ email: otherAdmin.email, code: issued.body.data.code, password: testPassword() });
    expect(afterReactivation.body.data).toMatchObject({ isSignedIn: true, profile: { role: 'ADMIN' } });
  });
});

describe('POST /api/users/{id}/setup-code', () => {
  it('reissues a code that replaces the previous one, and works as a password reset', async () => {
    const first = await issueFor(adminSession, newAdmin.userId);
    const second = await issueFor(adminSession, newAdmin.userId);
    expect(second.status).toBe(201);
    expect(second.body.data.code).not.toBe(first.body.data.code);
    expect((await setupAs({ email: newAdmin.email, code: first.body.data.code, password: testPassword() })).status).toBe(401);
    const password = testPassword();
    expect((await setupAs({ email: newAdmin.email, code: second.body.data.code, password })).status).toBe(200);
    await expect(signIn(harness, newAdmin.email, password)).resolves.toBeDefined();
  });

  it('refuses teacher and student accounts (403), deactivated accounts (409) and unknown users (404)', async () => {
    for (const userId of [teacher.userId, student.userId]) {
      const refused = await issueFor(adminSession, userId);
      expect(refused.status).toBe(403);
      expect(refused.body.error?.message).toBe('Setup codes can only be issued for administrator accounts.');
    }
    await setStatus(deactivate, otherAdmin.userId);
    const inactive = await issueFor(adminSession, otherAdmin.userId);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error?.message).toBe('This account is deactivated. Reactivate it first.');
    await setStatus(reactivate, otherAdmin.userId);
    expect((await issueFor(adminSession, '00000000-0000-4000-8000-00000000dead')).status).toBe(404);
  });

  it('a code left from before cannot set a teacher password through the admin setup', async () => {
    // EVEN IF A CODE ROW EXISTED FOR A TEACHER, THE CONSUME FUNCTION ONLY MATCHES ADMINISTRATORS.
    const code = '7K2M-Q9TB-4HXD';
    await db.query(
      'insert into public."accountSetupCodes" ("userId", "codeHash", "expiresAt") values ($1, $2, now() + interval \'1 day\')',
      [teacher.userId, hashSetupCode(normalizeSetupCode(code))],
    );
    const result = await setupAs({ email: teacher.email, code, password: testPassword() });
    expect(result.status).toBe(401);
    await db.query('delete from public."accountSetupCodes" where "userId" = $1', [teacher.userId]);
  });

  it('is admin only, and same-origin only', async () => {
    expect((await issueFor(anonymous(), newAdmin.userId)).status).toBe(401);
    expect((await issueFor(teacherSession, newAdmin.userId)).status).toBe(403);
    const crossSite = await api(adminSession, issueCode, 'POST', `/api/users/${newAdmin.userId}/setup-code`, {
      params: { id: newAdmin.userId },
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

  it('finds a teacher by employee code, name or mobile number, combined with the status filter', async () => {
    const byCode = await api(adminSession, teachers.GET, 'GET', `/api/teachers?search=${encodeURIComponent(testCode('SETUP-T'))}&isActive=true`);
    expect(byCode.body.data.items.map((t: { userId: string }) => t.userId)).toEqual([teacher.userId]);
    const byName = await api(adminSession, teachers.GET, 'GET', '/api/teachers?search=setup%20teacher');
    expect(byName.body.data.items.map((t: { userId: string }) => t.userId)).toContain(teacher.userId);
    const byPhone = await api(adminSession, teachers.GET, 'GET', `/api/teachers?search=${teacher.phone}`);
    expect(byPhone.body.data.items.map((t: { userId: string }) => t.userId)).toEqual([teacher.userId]);
  });

  it('rejects filter syntax in the search term (400)', async () => {
    for (const term of ['a,b', 'x)', 'a*', '%']) {
      expect((await api(adminSession, students.GET, 'GET', `/api/students?search=${encodeURIComponent(term)}`)).status, term).toBe(400);
    }
  });
});
