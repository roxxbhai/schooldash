import { ensureItAdmin, provisionTestAccount, teardown } from './helpers/actors';
import type { TestAccount } from './helpers/actors';
import { actAsOwner, connect, expectSqlError } from './helpers/db';
import { anonymous, APP, call, signIn } from './helpers/http';
import type { CookieStore } from './helpers/http';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as studentLogin } from '@/app/api/auth/student/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as deactivate } from '@/app/api/users/[id]/deactivate/route';
import { POST as reactivate } from '@/app/api/users/[id]/reactivate/route';
import { ApiError } from '@/helpers/api-error';
import { mapDbError } from '@/helpers/db-error';

/**
 * REAL-SUPABASE tests for account deactivation/reactivation and database
 * error mapping (Phase 3, Checkpoint 1). Only Next's cookie store is simulated.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));


const harness = { state };
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SESSION_COOKIE = `sb-${new URL(URL_).hostname.split('.')[0]}-auth-token`;

let itAdmin: TestAccount;
let student: TestAccount;
let teacher: TestAccount;
const studentAdmissionNumber = `ITS-${Date.now()}`;
let adminSession: CookieStore;
let teacherSession: CookieStore;

const statusCall = (handler: unknown, as: CookieStore, id: string, headers?: Record<string, string>) =>
  call(harness, as, handler, 'POST', `/api/users/${id}/x`, { params: { id }, headers });

async function auditCount(entityId: string, action: string) {
  const db = await connect();
  try {
    return Number((await db.query('select count(*) from public."auditLogs" where "entityId" = $1 and action = $2', [entityId, action])).rows[0].count);
  } finally {
    await db.end();
  }
}

beforeAll(async () => {
  itAdmin = await ensureItAdmin();
  student = await provisionTestAccount('status-student', { role: 'STUDENT', profile: { admissionNumber: studentAdmissionNumber } });
  teacher = await provisionTestAccount('status-teacher', { role: 'TEACHER', profile: {} });
  adminSession = await signIn(harness, itAdmin.email, itAdmin.password);
  teacherSession = await signIn(harness, teacher.email, teacher.password);
});

afterAll(async () => {
  await teardown(itAdmin);
});

describe('deactivate / reactivate endpoints: authorization', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const result = await statusCall(deactivate, anonymous(), student.userId);
    expect(result.status).toBe(401);
  });

  it('rejects non-admin callers with 403 (a teacher cannot deactivate a student)', async () => {
    const result = await statusCall(deactivate, teacherSession, student.userId);
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe('FORBIDDEN');
  });

  it('rejects cross-site requests', async () => {
    const result = await statusCall(deactivate, adminSession, student.userId, { origin: 'https://evil.example' });
    expect(result.body.error?.code).toBe('CSRF_REJECTED');
  });

  it('an admin cannot change their own status', async () => {
    const result = await statusCall(deactivate, adminSession, itAdmin.userId);
    expect(result.status).toBe(403);
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    expect((await statusCall(deactivate, adminSession, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await statusCall(deactivate, adminSession, 'not-a-uuid')).status).toBe(400);
  });

  it('ordinary users cannot call the status function through the Data API', async () => {
    const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    await client.auth.signInWithPassword(teacher);
    const { error } = await client.rpc('setAppUserStatus', {
      userId: teacher.userId,
      isActive: true,
      actorUserId: teacher.userId,
    });
    expect(error?.code).toBe('42501');
  });
});

describe('deactivation lifecycle (real Auth sessions)', () => {
  let studentSession: CookieStore;
  let staleAccessToken: string;
  let staleRefreshToken: string;

  it('an active student is signed in', async () => {
    studentSession = await signIn(harness, student.email, student.password);
    const session = JSON.parse(
      Buffer.from(studentSession.jar.get(SESSION_COOKIE)!.replace(/^base64-/, ''), 'base64url').toString(),
    );
    staleAccessToken = session.access_token;
    staleRefreshToken = session.refresh_token;
    expect((await call(harness, studentSession, me, 'GET', '/api/auth/me')).status).toBe(200);
  });

  it('an admin deactivates the student: sessions revoked, audit entry written', async () => {
    const result = await statusCall(deactivate, adminSession, student.userId);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ userId: student.userId, isActive: false, changed: true });
    expect(result.body.data.revokedSessions).toBeGreaterThanOrEqual(1);
    expect(await auditCount(student.userId, 'users.deactivate')).toBe(1);
  });

  it("the student's existing session is rejected by the API", async () => {
    // Sessions were deleted, so getUser() fails before the isActive check: 401.
    const result = await call(harness, studentSession, me, 'GET', '/api/auth/me');
    expect(result.status).toBe(401);
    expect(result.body.data).toBeNull();
  });

  it('the revoked refresh token cannot mint new tokens', async () => {
    const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    const { data, error } = await client.auth.refreshSession({ refresh_token: staleRefreshToken });
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("an already-issued access token can read only the user's own (inactive) users row", async () => {
    const client = createClient(URL_, PUBLISHABLE, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${staleAccessToken}` } },
    });
    const users = await client.from('users').select('id, isActive');
    expect(users.data).toEqual([{ id: student.userId, isActive: false }]);
    const students = await client.from('students').select('id');
    expect(students.data).toEqual([]);
  });

  it('the student cannot sign in while deactivated', async () => {
    harness.state.cookies = anonymous();
    const response = await studentLogin(
      new Request(`${APP}/api/auth/student/login`, {
        method: 'POST',
        headers: { origin: APP, 'content-type': 'application/json' },
        body: JSON.stringify({ admissionNumber: studentAdmissionNumber }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('repeating the deactivation is a no-op and is not audited again', async () => {
    const result = await statusCall(deactivate, adminSession, student.userId);
    expect(result.body.data).toMatchObject({ changed: false, revokedSessions: 0 });
    expect(await auditCount(student.userId, 'users.deactivate')).toBe(1);
  });

  it('history is preserved: the users and students rows still exist', async () => {
    const db = await connect();
    try {
      const { rows } = await db.query(
        `select u."isActive", u."deactivatedAt" is not null as stamped, s.id is not null as has_profile
         from public.users u left join public.students s on s."userId" = u.id where u.id = $1`,
        [student.userId],
      );
      expect(rows).toEqual([{ isActive: false, stamped: true, has_profile: true }]);
    } finally {
      await db.end();
    }
  });

  it('an admin reactivates the student, who can sign in again', async () => {
    const result = await statusCall(reactivate, adminSession, student.userId);
    expect(result.body.data).toMatchObject({ isActive: true, changed: true });
    expect(await auditCount(student.userId, 'users.reactivate')).toBe(1);

    const session = await signIn(harness, student.email, student.password);
    const profile = await call(harness, session, me, 'GET', '/api/auth/me');
    expect(profile.body.data).toEqual({ id: student.userId, role: 'STUDENT', isActive: true, fullName: 'IT status-student', email: student.email });
  });
});

describe('last-administrator protection (real function, rolled back)', () => {
  it('refuses to deactivate the only remaining active admin', async () => {
    const db = await connect();
    try {
      await db.query('begin');
      // Inside this rolled-back transaction only: leave the integration admin as the sole active admin.
      await db.query(
        'update public.users set "isActive" = false, "deactivatedAt" = now() where role = \'admin\' and id <> $1',
        [itAdmin.userId],
      );
      await db.query('set local role service_role');
      await expectSqlError(db, 'select public."setAppUserStatus"($1, false, null)', [itAdmin.userId], 'SD002');
      await actAsOwner(db);
    } finally {
      await db.query('rollback');
      await db.end();
    }
  });
});

describe('database error mapping against real errors', () => {
  async function realError(sql: string, params: unknown[], setup: string[] = []) {
    const db = await connect();
    try {
      await db.query('begin');
      for (const statement of setup) await db.query(statement);
      await db.query(sql, params);
      throw new Error('expected the statement to fail');
    } catch (error) {
      const e = error as { code?: string; message?: string; detail?: string };
      return mapDbError({ code: e.code, message: e.message, details: e.detail }, 'test');
    } finally {
      await db.query('rollback');
      await db.end();
    }
  }

  it('maps a real unique violation to 409', async () => {
    const mapped = await realError('insert into public.subjects (code, name) values (\'IT-DUP\', \'IT DUP A\'), (\'IT-DUP\', \'IT DUP B\')', []);
    expect((mapped as ApiError).status).toBe(409);
  });

  it('maps a real missing reference to 422 and a referenced delete to 409', async () => {
    const missing = await realError(
      'insert into public.classes ("academicYearId", name, section) values (\'00000000-0000-4000-8000-000000000000\', \'1\', \'Y\')',
      [],
    );
    expect((missing as ApiError).status).toBe(422);

    const referenced = await realError(
      'delete from public."academicYears" where name = \'IT-REF\'',
      [],
      [
        'insert into public."academicYears" (name, "startDate", "endDate") values (\'IT-REF\', \'2098-01-01\', \'2098-12-31\')',
        'insert into public.classes ("academicYearId", name, section) select id, \'1\', \'R\' from public."academicYears" where name = \'IT-REF\'',
      ],
    );
    expect([(referenced as ApiError).status, (referenced as ApiError).code]).toEqual([409, 'CONFLICT']);
  });

  it('maps a real check violation to 422', async () => {
    const mapped = await realError(
      'insert into public."academicYears" (name, "startDate", "endDate") values (\'IT-BAD\', \'2099-12-31\', \'2099-01-01\')',
      [],
    );
    expect((mapped as ApiError).status).toBe(422);
  });

  it('maps a real malformed UUID to 400', async () => {
    const mapped = await realError('select * from public.subjects where id = \'nope\'::uuid', []);
    expect((mapped as ApiError).status).toBe(400);
  });
});
