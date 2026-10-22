import { fakeCookieStore } from '../helpers/fake-cookies';
import { connect } from './helpers/db';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as adminLogin } from '@/app/api/auth/admin/login/route';
import { POST as studentLogin } from '@/app/api/auth/student/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { provisionAccount } from '@/functions/provisioning';
import { unwrapResult } from '@/helpers/function-result';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import { updateSession } from '@/helpers/supabase-proxy';
import type pg from 'pg';

/**
 * END-TO-END tests against the real Supabase Auth server, Data API and
 * database. Only Next.js's request cookie store is simulated (Route Handlers
 * are called in-process); every Supabase call is real.
 *
 * Creates uniquely named identities (it-<run>-*@example.com) and deletes
 * them afterwards. Provisioning audit entries are append-only by design and
 * remain (action 'users.provision', email domain example.com).
 */

const state = vi.hoisted(() => ({
  cookies: undefined as unknown as ReturnType<typeof import('../helpers/fake-cookies').fakeCookieStore>,
}));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));


const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const APP = 'http://localhost:3000';
const REF = new URL(URL_).hostname.split('.')[0];
const SESSION_COOKIE = `sb-${REF}-auth-token`;

const run = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
const email = (label: string) => `it-${run}-${label}@example.com`;
const password = () => `It-${randomBytes(18).toString('base64url')}`;

const accounts = {
  student: { email: email('student'), password: password(), admissionNumber: `IT-${run}-student`, userId: '', authUserId: '', studentId: '' },
  other: { email: email('other'), password: password(), admissionNumber: `IT-${run}-other`, userId: '', authUserId: '', studentId: '' },
  admin: { email: email('admin'), password: password(), userId: '', authUserId: '' },
  inactive: { email: email('inactive'), password: password(), userId: '', authUserId: '' },
  unprovisioned: { email: email('unprovisioned'), password: password(), authUserId: '' },
};

const admin = () => createSupabaseAdminClient();
const createdAuthIds = new Set<string>();
let db: pg.Client;

// --- helpers ------------------------------------------------------------------

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${APP}${path}`, {
    method: 'POST',
    headers: { origin: APP, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

/** STUDENTS SIGN IN WITH THEIR ADMISSION NUMBER; EVERYONE ELSE HERE IS AN ADMINISTRATOR (EMAIL + PASSWORD). */
async function signIn(account: { email: string; password: string; admissionNumber?: string }) {
  state.cookies = fakeCookieStore();
  if (account.admissionNumber) return json(await studentLogin(post('/api/auth/student/login', { admissionNumber: account.admissionNumber })));
  return json(await adminLogin(post('/api/auth/admin/login', { email: account.email, password: account.password })));
}

function decodeSessionCookie(value: string) {
  return JSON.parse(Buffer.from(value.replace(/^base64-/, ''), 'base64url').toString('utf8'));
}

function encodeSessionCookie(session: unknown) {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

// --- setup / teardown -----------------------------------------------------------

beforeAll(async () => {
  db = await connect();

  for (const [label, account] of [['student', accounts.student], ['other', accounts.other]] as const) {
    const created = unwrapResult(await provisionAccount({
      email: account.email,
      fullName: `IT ${label}`,
      role: 'STUDENT',
      password: account.password,
      profile: { admissionNumber: account.admissionNumber },
    }));
    createdAuthIds.add(created.authUserId);
    account.userId = created.userId;
    account.authUserId = created.authUserId;
    account.studentId = (await db.query('select id from public.students where "userId" = $1', [created.userId])).rows[0].id;
  }

  const activeAdmin = unwrapResult(await provisionAccount({ email: accounts.admin.email, fullName: 'IT admin', role: 'ADMIN', password: accounts.admin.password }));
  createdAuthIds.add(activeAdmin.authUserId);
  accounts.admin.userId = activeAdmin.userId;

  const inactive = unwrapResult(await provisionAccount({
    email: accounts.inactive.email,
    fullName: 'IT inactive',
    role: 'ADMIN',
    password: accounts.inactive.password,
  }));
  createdAuthIds.add(inactive.authUserId);
  accounts.inactive.userId = inactive.userId;
  // Deactivation goes through the service role, as a future admin API would.
  const deactivate = await admin()
    .from('users')
    .update({ isActive: false, deactivatedAt: new Date().toISOString() })
    .eq('id', inactive.userId);
  expect(deactivate.error).toBeNull();

  const bare = await admin().auth.admin.createUser({
    email: accounts.unprovisioned.email,
    password: accounts.unprovisioned.password,
    email_confirm: true,
  });
  expect(bare.error).toBeNull();
  accounts.unprovisioned.authUserId = bare.data.user!.id;
  createdAuthIds.add(bare.data.user!.id);
});

afterAll(async () => {
  // Application rows first (FK to auth.users is ON DELETE RESTRICT), then Auth.
  if (db) {
    const authIds = [...createdAuthIds];
    await db.query(
      'delete from public.students where "userId" in (select id from public.users where "authUserId" = any($1))',
      [authIds],
    );
    await db.query(
      'delete from public.teachers where "userId" in (select id from public.users where "authUserId" = any($1))',
      [authIds],
    );
    await db.query('delete from public.users where "authUserId" = any($1)', [authIds]);
    await db.end();
  }
  for (const authId of createdAuthIds) {
    await admin().auth.admin.deleteUser(authId);
  }
});

beforeEach(() => {
  state.cookies = fakeCookieStore();
});

// --- authentication -------------------------------------------------------------

describe('login and session (real Supabase Auth)', () => {
  it('signs a student in with the admission number alone, sets the session cookie, and /me resolves the database role', async () => {
    const result = await signIn(accounts.student);
    expect(result).toEqual({
      status: 200,
      body: { data: { id: accounts.student.userId, role: 'STUDENT', isActive: true, fullName: 'IT student', email: accounts.student.email }, error: null },
    });
    expect(state.cookies.jar.get(SESSION_COOKIE)).toMatch(/^base64-/);

    expect(await json(await me())).toEqual(result);
  });

  it('signs an administrator in with email and password', async () => {
    const result = await signIn(accounts.admin);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ id: accounts.admin.userId, role: 'ADMIN' });
  });

  it('rejects a wrong password with the generic 401', async () => {
    const result = await signIn({ email: accounts.admin.email, password: 'Wrong-password-123' });
    expect(result).toEqual({
      status: 401,
      body: { data: null, error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' } },
    });
    expect(state.cookies.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("refuses a student's correct email and password on the administrator sign-in, and discards the session", async () => {
    const result = await signIn({ email: accounts.student.email, password: accounts.student.password });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(state.cookies.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('rejects an unknown admission number', async () => {
    const result = await signIn({ email: '', password: '', admissionNumber: `IT-${run}-nobody` });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same 401', async () => {
    const result = await signIn({ email: email('nobody'), password: 'Whatever-password-1' });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses an Auth user without an application account and discards the session', async () => {
    const result = await signIn(accounts.unprovisioned);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ACCOUNT_NOT_PROVISIONED');
    expect(state.cookies.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('refuses a deactivated account', async () => {
    const result = await signIn(accounts.inactive);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(state.cookies.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('rejects missing, malformed and forged sessions on /me', async () => {
    expect((await me()).status).toBe(401);

    state.cookies = fakeCookieStore({ [SESSION_COOKIE]: 'base64-not-a-session' });
    expect((await me()).status).toBe(401);

    // Structurally valid session whose access token was never issued by Supabase.
    await signIn(accounts.student);
    const session = decodeSessionCookie(state.cookies.jar.get(SESSION_COOKIE)!);
    const forged = { ...session, access_token: `${session.access_token.split('.').slice(0, 2).join('.')}.forged` };
    state.cookies = fakeCookieStore({ [SESSION_COOKIE]: encodeSessionCookie(forged) });
    expect((await me()).status).toBe(401);
  });

  it('refreshes an expired session using the refresh token and writes new cookies', async () => {
    await signIn(accounts.student);
    const session = decodeSessionCookie(state.cookies.jar.get(SESSION_COOKIE)!);
    const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };
    state.cookies = fakeCookieStore({ [SESSION_COOKIE]: encodeSessionCookie(expired) });

    const result = await json(await me());
    expect(result.status).toBe(200);
    expect(result.body.data.id).toBe(accounts.student.userId);

    const refreshed = decodeSessionCookie(state.cookies.jar.get(SESSION_COOKIE)!);
    expect(refreshed.refresh_token).not.toBe(session.refresh_token);
    expect(refreshed.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('logout clears the cookie and revokes the session server-side', async () => {
    await signIn(accounts.student);
    const cookieValue = state.cookies.jar.get(SESSION_COOKIE)!;

    const result = await json(await logout(post('/api/auth/logout')));
    expect(result).toEqual({ status: 200, body: { data: { signedOut: true }, error: null } });
    expect(state.cookies.jar.has(SESSION_COOKIE)).toBe(false);

    // Replaying the old cookie must fail: getUser() checks the session is still live.
    state.cookies = fakeCookieStore({ [SESSION_COOKIE]: cookieValue });
    expect((await me()).status).toBe(401);
  });

  it('logout without a session succeeds', async () => {
    expect((await json(await logout(post('/api/auth/logout')))).status).toBe(200);
  });
});

describe('session-refresh proxy (real Supabase Auth)', () => {
  it('refreshes an expired session and returns cookies with no-store headers', async () => {
    await signIn(accounts.other);
    const session = decodeSessionCookie(state.cookies.jar.get(SESSION_COOKIE)!);
    const expired = encodeSessionCookie({ ...session, expires_at: Math.floor(Date.now() / 1000) - 60 });

    const request = new NextRequest(`${APP}/student`, { headers: { cookie: `${SESSION_COOKIE}=${expired}` } });
    const response = await updateSession(request);

    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie?.value).toMatch(/^base64-/);
    expect(decodeSessionCookie(setCookie!.value).refresh_token).not.toBe(session.refresh_token);
    expect(response.headers.get('cache-control')).toContain('no-store');
    // The refreshed tokens are also forwarded to the page/handler in this request.
    expect(request.cookies.get(SESSION_COOKIE)?.value).toBe(setCookie!.value);
  });

  it('passes anonymous requests through without touching cookies', async () => {
    const response = await updateSession(new NextRequest(`${APP}/`));
    expect(response.cookies.getAll()).toEqual([]);
  });
});

// --- Data API with real JWTs (RLS end to end) ------------------------------------

describe('Data API access with real tokens', () => {
  async function studentClient() {
    const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword(accounts.student);
    expect(error).toBeNull();
    return client;
  }

  it('a student reads only their own rows', async () => {
    const client = await studentClient();
    const students = await client.from('students').select('id');
    expect(students.error).toBeNull();
    expect(students.data).toEqual([{ id: accounts.student.studentId }]);

    const users = await client.from('users').select('id, role');
    expect(users.data).toEqual([{ id: accounts.student.userId, role: 'student' }]);

    const other = await client.from('students').select('id').eq('id', accounts.other.studentId);
    expect(other.data).toEqual([]);
  });

  it('a student cannot promote themselves or call provisioning', async () => {
    const client = await studentClient();
    const promote = await client.from('users').update({ role: 'admin' }).eq('id', accounts.student.userId);
    expect(promote.error?.code).toBe('42501');

    const rpc = await client.rpc('provisionAppUser', {
      authUserId: accounts.unprovisioned.authUserId,
      email: accounts.unprovisioned.email,
      fullName: 'Escalation',
      role: 'admin',
    });
    expect(rpc.error?.code).toBe('42501');

    const lookup = await client.rpc('findAuthUserIdByEmail', { email: accounts.other.email });
    expect(lookup.error?.code).toBe('42501');
  });

  it('an unauthenticated client cannot read school data', async () => {
    const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    for (const table of ['users', 'students', 'results', 'auditLogs'] as const) {
      const { data, error } = await anon.from(table).select('id').limit(1);
      expect(data, table).toBeNull();
      expect(error?.code, table).toBe('42501');
    }
  });

  it('public self-registration is disabled on the project', async () => {
    const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    const address = email('signup');
    const { data, error } = await anon.auth.signUp({ email: address, password: password() });
    expect(data.user).toBeNull();
    expect(error?.code).toBe('signup_disabled');
    expect((await admin().rpc('findAuthUserIdByEmail', { email: address })).data).toBeNull();
  });

  it('Supabase rejects the secret key when sent from a browser', async () => {
    const response = await fetch(`${URL_}/rest/v1/users?select=id&limit=1`, {
      headers: {
        apikey: SECRET,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      },
    });
    expect(response.status).toBe(401);
  });
});

// --- provisioning --------------------------------------------------------------

describe('account provisioning service (real Auth + database)', () => {
  const authIdFor = async (address: string) =>
    (await admin().rpc('findAuthUserIdByEmail', { email: address })).data;

  it('writes the users row, profile and audit entry together', async () => {
    const audit = await db.query(
      'select action, "actorUserId" from public."auditLogs" where "entityId" = $1',
      [accounts.student.userId],
    );
    expect(audit.rows).toEqual([{ action: 'users.provision', actorUserId: null }]);
  });

  it('rejects a duplicate email without creating another Auth user', async () => {
    await expect(
      provisionAccount({ email: accounts.student.email, fullName: 'Dup', role: 'ADMIN', password: password() }),
    ).resolves.toMatchObject({ success: false, data: { status: 409, code: 'CONFLICT' } });
  });

  it('deletes the new Auth user when the database step fails (compensation)', async () => {
    const address = email('dup-admission');
    await expect(
      provisionAccount({
        email: address,
        fullName: 'Dup admission',
        role: 'STUDENT',
        password: password(),
        profile: { admissionNumber: `IT-${run}-student` }, // already used
      }),
    ).resolves.toMatchObject({ success: false, data: { status: 409 } });
    expect(await authIdFor(address)).toBeNull();
    expect((await db.query('select 1 from public.users where email = $1', [address])).rowCount).toBe(0);
  });

  it('validates input before touching Auth', async () => {
    const address = email('invalid');
    await expect(
      provisionAccount({ email: address, fullName: 'No profile', role: 'TEACHER' } as never),
    ).resolves.toMatchObject({ success: false, data: { status: 422, code: 'VALIDATION_ERROR' } });
    expect(await authIdFor(address)).toBeNull();
  });

  it('links an existing Auth user when asked (bootstrap / recovery path)', async () => {
    const address = email('link');
    const bare = await admin().auth.admin.createUser({ email: address, password: password(), email_confirm: true });
    createdAuthIds.add(bare.data.user!.id);

    await expect(
      provisionAccount({ email: address, fullName: 'Linked', role: 'ADMIN' }),
    ).resolves.toMatchObject({ success: false, data: { status: 409 } });

    const linked = unwrapResult(await provisionAccount(
      { email: address, fullName: 'Linked', role: 'ADMIN' },
      { linkExistingAuthUser: true },
    ));
    expect(linked).toMatchObject({ authUserId: bare.data.user!.id, isAuthUserCreated: false, role: 'ADMIN' });

    // Deactivate immediately: no test admin stays usable.
    await admin()
      .from('users')
      .update({ isActive: false, deactivatedAt: new Date().toISOString() })
      .eq('id', linked.userId);
  });

  it('does not fabricate success when credentials are wrong', async () => {
    const broken = createClient(URL_, 'invalid-secret-key-for-test', { auth: { persistSession: false } });
    const result = await provisionAccount({ email: email('broken'), fullName: 'X', role: 'ADMIN' }, { client: broken as never });
    expect(result.success).toBe(false);
    expect(result.success ? 0 : result.data.status).toBeGreaterThanOrEqual(500);
  });
});
