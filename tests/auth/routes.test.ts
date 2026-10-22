import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCookieStore } from '../helpers/fake-cookies';

/**
 * Mocked integration tests for the auth Route Handlers.
 *
 * The real @supabase/ssr and @supabase/supabase-js code runs; only the
 * network (`fetch`) and Next.js's request cookie store are faked. No Supabase
 * project is contacted.
 */

const state = vi.hoisted(() => ({
  cookieStore: undefined as unknown as ReturnType<typeof import('../helpers/fake-cookies').fakeCookieStore>,
}));

vi.mock('next/headers', () => ({ cookies: async () => state.cookieStore }));
vi.mock('next/server', () => ({ connection: async () => {} }));

import { GET as me } from '@/app/api/auth/me/route';
import { POST as login } from '@/app/api/auth/admin/login/route';
import { POST as studentLogin } from '@/app/api/auth/student/login/route';
import { POST as teacherLogin } from '@/app/api/auth/teacher/login/route';
import { POST as teacherSignUp } from '@/app/api/auth/teacher/sign-up/route';
import { POST as logout } from '@/app/api/auth/logout/route';

const SUPABASE_URL = 'https://example.supabase.co';
const SESSION_COOKIE = 'sb-example-auth-token';
const APP = 'http://localhost:3000';

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACCESS_TOKEN = 'fake-access-token-7c1d';
const REFRESH_TOKEN = 'fake-refresh-token-9e4b';
const PASSWORD = 'correct-horse-battery-staple';
const MAGIC_TOKEN = 'fake-magic-link-token-3f8a';

const authUserJson = (metadata: Record<string, unknown> = {}) => ({
  id: AUTH_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'asha@example.com',
  app_metadata: metadata,
  user_metadata: metadata,
  created_at: '2026-01-01T00:00:00Z',
});

function sessionJson() {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUserJson(),
  };
}

/** A cookie exactly as @supabase/ssr writes it (base64url-encoded session). */
function sessionCookie(): Record<string, string> {
  const encoded = Buffer.from(JSON.stringify(sessionJson())).toString('base64url');
  return { [SESSION_COOKIE]: `base64-${encoded}` };
}

// --- Fake Supabase HTTP API ---------------------------------------------------

type Handler = (request: Request) => Response | Promise<Response>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let routes: Record<string, Handler>;
let requests: Request[];

function defaultRoutes(): Record<string, Handler> {
  return {
    'GET /auth/v1/user': (req) =>
      req.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`
        ? json(authUserJson())
        : json({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, 401),
    'POST /auth/v1/token': () => json(sessionJson()),
    'POST /auth/v1/logout': () => new Response(null, { status: 204 }),
    'GET /rest/v1/users': () =>
      json([{ id: USER_ID, authUserId: AUTH_ID, role: 'student', isActive: true, fullName: 'Asha Verma', email: 'asha@example.com' }]),
  };
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  requests.push(request.clone());
  const { pathname } = new URL(request.url);
  const handler = routes[`${request.method} ${pathname}`];
  if (!handler) throw new Error(`Unexpected request: ${request.method} ${pathname}`);
  return handler(request);
});

// --- Helpers ------------------------------------------------------------------

const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  routes = defaultRoutes();
  requests = [];
  state.cookieStore = fakeCookieStore();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-service-key-must-not-be-used');
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}));
  }
});

afterEach(() => {
  // Secrets must never reach logs, whichever test ran.
  const logged = consoleSpies.flatMap((spy) => spy.mock.calls.flat()).map(String).join('\n');
  for (const secret of [PASSWORD, ACCESS_TOKEN, REFRESH_TOKEN, MAGIC_TOKEN, 'test-service-key']) {
    expect(logged).not.toContain(secret);
  }
  consoleSpies.splice(0).forEach((spy) => spy.mockRestore());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function postRequest(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${APP}${path}`, {
    method: 'POST',
    headers: {
      origin: APP,
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function read(response: Response) {
  const text = await response.text();
  for (const secret of [PASSWORD, ACCESS_TOKEN, REFRESH_TOKEN, MAGIC_TOKEN, 'test-service-key']) {
    expect(text, 'response leaks a secret').not.toContain(secret);
  }
  return { status: response.status, body: JSON.parse(text) };
}

const supabaseCalls = () => requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
const sentServiceKey = () =>
  requests.some((r) => [...r.headers.values()].some((v) => v.includes('test-service-key')));

/** THE APPLICATION `users` ROW RETURNED FOR THE SIGNED-IN IDENTITY. */
const appUserRow = (role: string, isActive = true) =>
  json([{ id: USER_ID, authUserId: AUTH_ID, role, isActive, fullName: 'Asha Verma', email: 'asha@example.com' }]);

// --- GET /api/auth/me -----------------------------------------------------------

describe('GET /api/auth/me', () => {
  it('rejects a missing session with 401 without calling Supabase', async () => {
    const { status, body } = await read(await me());
    expect(status).toBe(401);
    expect(body).toEqual({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
    });
    expect(requests).toEqual([]);
  });

  it('rejects a session the Auth server does not accept with 401', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /auth/v1/user'] = () =>
      json({ code: 403, error_code: 'session_not_found', msg: 'Session not found' }, 403);

    const { status, body } = await read(await me());
    expect(status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a garbage session cookie with 401', async () => {
    state.cookieStore = fakeCookieStore({ [SESSION_COOKIE]: 'base64-not-a-session' });
    expect((await me()).status).toBe(401);
  });

  it('returns only id, role, isActive, name and email for a valid session', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());

    const { status, body } = await read(await me());
    expect(status).toBe(200);
    expect(body).toEqual({
      data: { id: USER_ID, role: 'STUDENT', isActive: true, fullName: 'Asha Verma', email: 'asha@example.com' },
      error: null,
    });
    expect(supabaseCalls()).toEqual(['GET /auth/v1/user', 'GET /rest/v1/users']);
  });

  it('validates the session with the Auth server and queries as the user, not the service role', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    await me();

    const userLookup = requests.find((r) => new URL(r.url).pathname === '/rest/v1/users')!;
    expect(new URL(userLookup.url).searchParams.get('authUserId')).toBe(`eq.${AUTH_ID}`);
    expect(userLookup.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(sentServiceKey()).toBe(false);
  });

  it('rejects an Auth user without an application users row with 403', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /rest/v1/users'] = () => json([]);

    const { status, body } = await read(await me());
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_NOT_PROVISIONED');
  });

  it('rejects an inactive application user with 403', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /rest/v1/users'] = () =>
      json([{ id: USER_ID, authUserId: AUTH_ID, role: 'admin', isActive: false, fullName: 'Asha Verma', email: 'asha@example.com' }]);

    const { status, body } = await read(await me());
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('uses the database role even if Auth metadata claims admin', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /auth/v1/user'] = () => json(authUserJson({ role: 'ADMIN' }));

    const { body } = await read(await me());
    expect(body.data.role).toBe('STUDENT');
  });

  it('returns 503 when Supabase is not configured, without any network call', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    state.cookieStore = fakeCookieStore(sessionCookie());

    const { status, body } = await read(await me());
    expect(status).toBe(503);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(requests).toEqual([]);
  });

  it('returns 503 when Supabase is unreachable', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /auth/v1/user'] = () => {
      throw new TypeError('fetch failed');
    };
    expect((await me()).status).toBe(503);
  });

  it('hides database errors behind a generic 500', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['GET /rest/v1/users'] = () =>
      json({ code: '42501', message: 'permission denied for table "users"', details: null, hint: null }, 403);

    const { status, body } = await read(await me());
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('permission denied');
  });
});

// --- POST /api/auth/admin/login -------------------------------------------------

describe('POST /api/auth/admin/login', () => {
  const credentials = { email: 'asha@example.com', password: PASSWORD };

  beforeEach(() => {
    routes['GET /rest/v1/users'] = () => appUserRow('admin');
  });

  it('signs in, sets the session cookie, and returns the session profile', async () => {
    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', credentials)));

    expect(status).toBe(200);
    expect(body).toEqual({ data: { id: USER_ID, role: 'ADMIN', isActive: true, fullName: 'Asha Verma', email: 'asha@example.com' }, error: null });
    expect(state.cookieStore.jar.get(SESSION_COOKIE)).toMatch(/^base64-/);

    const tokenRequest = requests.find((r) => new URL(r.url).pathname === '/auth/v1/token')!;
    expect(new URL(tokenRequest.url).searchParams.get('grant_type')).toBe('password');
    expect(await tokenRequest.json()).toMatchObject({ email: 'asha@example.com', password: PASSWORD });
    expect(sentServiceKey()).toBe(false);
  });

  it('trims the email before authenticating', async () => {
    await login(postRequest('/api/auth/admin/login', { ...credentials, email: '  asha@example.com ' }));
    const tokenRequest = requests.find((r) => new URL(r.url).pathname === '/auth/v1/token')!;
    expect((await tokenRequest.json()).email).toBe('asha@example.com');
  });

  it.each([
    ['a malformed email', { email: 'not-an-email', password: PASSWORD }, 'email'],
    ['a missing email', { password: PASSWORD }, 'email'],
    ['a missing password', { email: 'asha@example.com' }, 'password'],
    ['an empty password', { email: 'asha@example.com', password: '' }, 'password'],
    ['a non-string password', { email: 'asha@example.com', password: 12345 }, 'password'],
  ])('rejects %s with 422 before contacting Supabase', async (_label, payload, field) => {
    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', payload)));
    expect(status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    expect(requests).toEqual([]);
  });

  it('does not echo the submitted password in validation errors', async () => {
    const response = await login(postRequest('/api/auth/admin/login', { email: 'bad', password: PASSWORD }));
    await read(response); // asserts no secrets in the body
  });

  it('rejects client-supplied roles or ids instead of honouring them', async () => {
    for (const extra of [{ role: 'ADMIN' }, { userId: USER_ID }, { isActive: true }]) {
      const { status, body } = await read(
        await login(postRequest('/api/auth/admin/login', { ...credentials, ...extra })),
      );
      expect(status).toBe(422);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(requests).toEqual([]);
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', '{oops')));
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('rejects form-encoded bodies with 400', async () => {
    const request = postRequest('/api/auth/admin/login', 'email=a&password=b', {
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect((await login(request)).status).toBe(400);
  });

  it('rejects cross-site requests with 403 before reading the body', async () => {
    const request = postRequest('/api/auth/admin/login', credentials, { origin: 'https://evil.example' });
    const { status, body } = await read(await login(request));
    expect(status).toBe(403);
    expect(body.error.code).toBe('CSRF_REJECTED');
    expect(requests).toEqual([]);
  });

  it.each([
    ['wrong password', 400, 'invalid_credentials'],
    ['unconfirmed email', 400, 'email_not_confirmed'],
    ['banned user', 400, 'user_banned'],
  ])('returns the same safe 401 for a %s', async (_label, status, code) => {
    routes['POST /auth/v1/token'] = () => json({ code: status, error_code: code, msg: 'detail' }, status);

    const response = await read(await login(postRequest('/api/auth/admin/login', credentials)));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      data: null,
      error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' },
    });
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it.each(['teacher', 'student'])('refuses a %s account with the same 401 and discards its session', async (role) => {
    routes['GET /rest/v1/users'] = () => appUserRow(role);

    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', credentials)));
    expect(status).toBe(401);
    expect(body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
    expect(supabaseCalls()).toEqual(['POST /auth/v1/token', 'GET /rest/v1/users', 'POST /auth/v1/logout']);
  });

  it('maps Supabase Auth rate limiting to 429', async () => {
    routes['POST /auth/v1/token'] = () =>
      json({ code: 429, error_code: 'over_request_rate_limit', msg: 'slow down' }, 429);
    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', credentials)));
    expect(status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('returns 503 when Supabase Auth is unreachable', async () => {
    routes['POST /auth/v1/token'] = () => {
      throw new TypeError('fetch failed');
    };
    expect((await login(postRequest('/api/auth/admin/login', credentials))).status).toBe(503);
  });

  it('refuses unprovisioned Auth users, discards their session, and creates nothing', async () => {
    routes['GET /rest/v1/users'] = () => json([]);

    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', credentials)));
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_NOT_PROVISIONED');
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
    expect(supabaseCalls()).toEqual([
      'POST /auth/v1/token',
      'GET /rest/v1/users',
      'POST /auth/v1/logout',
    ]);
    expect(requests.some((r) => r.method !== 'GET' && r.url.includes('/rest/v1/'))).toBe(false);
  });

  it('refuses inactive users and discards their session', async () => {
    routes['GET /rest/v1/users'] = () =>
      json([{ id: USER_ID, authUserId: AUTH_ID, role: 'teacher', isActive: false, fullName: 'Asha Verma', email: 'asha@example.com' }]);

    const { status, body } = await read(await login(postRequest('/api/auth/admin/login', credentials)));
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('returns 503 when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect((await login(postRequest('/api/auth/admin/login', credentials))).status).toBe(503);
    expect(requests).toEqual([]);
  });
});

// --- POST /api/auth/teacher/login -------------------------------------------------

describe('POST /api/auth/teacher/login', () => {
  const phoneLookups = () => requests.filter((r) => new URL(r.url).searchParams.has('phone'));

  beforeEach(() => {
    // THE SAME PATH ANSWERS THE PHONE LOOKUP (SECRET KEY) AND THE SESSION'S OWN users ROW.
    routes['GET /rest/v1/users'] = (req) =>
      new URL(req.url).searchParams.get('phone') === 'eq.9876543210' ? json([{ email: 'asha@example.com' }]) : appUserRow('teacher');
  });

  it('finds the identity by the normalized phone number, then signs in with the password', async () => {
    const { status, body } = await read(await teacherLogin(postRequest('/api/auth/teacher/login', { phone: '+91 98765-43210', password: PASSWORD })));

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: USER_ID, role: 'TEACHER' });
    expect(state.cookieStore.jar.get(SESSION_COOKIE)).toMatch(/^base64-/);
    const lookup = new URL(phoneLookups()[0].url).searchParams;
    expect(lookup.get('role')).toBe('eq.teacher');
    const tokenRequest = requests.find((r) => new URL(r.url).pathname === '/auth/v1/token')!;
    expect(await tokenRequest.json()).toMatchObject({ email: 'asha@example.com', password: PASSWORD });
  });

  it('gives an unknown number the same 401 as a wrong password, without trying to sign in', async () => {
    routes['GET /rest/v1/users'] = () => json([]);
    const { status, body } = await read(await teacherLogin(postRequest('/api/auth/teacher/login', { phone: '9123456780', password: PASSWORD })));
    expect(status).toBe(401);
    expect(body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'The phone number or password is incorrect.' });
    expect(supabaseCalls()).not.toContain('POST /auth/v1/token');
  });

  it('returns the same 401 for a wrong password', async () => {
    routes['POST /auth/v1/token'] = () => json({ code: 400, error_code: 'invalid_credentials', msg: 'detail' }, 400);
    const { status, body } = await read(await teacherLogin(postRequest('/api/auth/teacher/login', { phone: '9876543210', password: PASSWORD })));
    expect(status).toBe(401);
    expect(body.error.message).toBe('The phone number or password is incorrect.');
  });

  it.each([
    ['a number that is too short', { phone: '98765', password: PASSWORD }, 'phone'],
    ['a landline-style number', { phone: '0141 2345678', password: PASSWORD }, 'phone'],
    ['an email instead of a phone', { email: 'asha@example.com', password: PASSWORD }, 'phone'],
  ])('rejects %s with 422 before contacting Supabase', async (_label, payload, field) => {
    const { status, body } = await read(await teacherLogin(postRequest('/api/auth/teacher/login', payload)));
    expect(status).toBe(422);
    expect(body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    expect(requests).toEqual([]);
  });
});

// --- POST /api/auth/teacher/sign-up -----------------------------------------------

describe('POST /api/auth/teacher/sign-up', () => {
  const NEW_PASSWORD = 'a long and memorable sentence';

  beforeEach(() => {
    routes['POST /rest/v1/rpc/claimTeacherSignUp'] = () => json({ status: 'claimed', userId: USER_ID, authUserId: AUTH_ID, email: 'asha@example.com' });
    routes[`PUT /auth/v1/admin/users/${AUTH_ID}`] = () => json(authUserJson());
    routes['GET /rest/v1/users'] = () => appUserRow('teacher');
  });

  it('claims the sign-up, sets the password with the secret key, and signs the teacher in', async () => {
    const { status, body } = await read(await teacherSignUp(postRequest('/api/auth/teacher/sign-up', { phone: '098765 43210', password: NEW_PASSWORD })));

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ isSignedIn: true, profile: { role: 'TEACHER' } });
    expect(state.cookieStore.jar.get(SESSION_COOKIE)).toMatch(/^base64-/);
    const claim = requests.find((r) => r.url.includes('claimTeacherSignUp'))!;
    expect(await claim.json()).toEqual({ phone: '9876543210' });
    const update = requests.find((r) => r.method === 'PUT')!;
    expect(await update.json()).toMatchObject({ password: NEW_PASSWORD });
  });

  it.each([
    ['notFound', 404, 'NOT_FOUND'],
    ['inactive', 403, 'ACCOUNT_INACTIVE'],
    ['alreadySignedUp', 409, 'CONFLICT'],
  ])('answers a %s claim with %i and sets no password', async (claimStatus, status, code) => {
    routes['POST /rest/v1/rpc/claimTeacherSignUp'] = () => json({ status: claimStatus });
    const result = await read(await teacherSignUp(postRequest('/api/auth/teacher/sign-up', { phone: '9876543210', password: NEW_PASSWORD })));
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('releases the claim when the password is rejected as weak', async () => {
    routes[`PUT /auth/v1/admin/users/${AUTH_ID}`] = () =>
      json({ code: 422, error_code: 'weak_password', msg: 'weak', weak_password: { reasons: ['pwned'] } }, 422);
    routes['PATCH /rest/v1/users'] = () => new Response(null, { status: 204 });

    const { status, body } = await read(await teacherSignUp(postRequest('/api/auth/teacher/sign-up', { phone: '9876543210', password: NEW_PASSWORD })));
    expect(status).toBe(422);
    expect(body.error.details[0].path).toBe('password');
    const release = requests.find((r) => r.method === 'PATCH')!;
    expect(new URL(release.url).searchParams.get('id')).toBe(`eq.${USER_ID}`);
    expect(await release.json()).toEqual({ passwordSetAt: null });
  });

  it('requires a password of at least 12 characters', async () => {
    const { status } = await read(await teacherSignUp(postRequest('/api/auth/teacher/sign-up', { phone: '9876543210', password: 'short' })));
    expect(status).toBe(422);
    expect(requests).toEqual([]);
  });
});

// --- POST /api/auth/student/login -------------------------------------------------

describe('POST /api/auth/student/login', () => {
  beforeEach(() => {
    routes['GET /rest/v1/students'] = (req) =>
      new URL(req.url).searchParams.get('admissionNumber') === 'eq.EM-2026-014'
        ? json([{ user: { authUserId: AUTH_ID, email: 'asha@example.com', isActive: true } }])
        : json([]);
    routes['POST /auth/v1/admin/generate_link'] = () =>
      json({ ...authUserJson(), action_link: 'x', email_otp: '000000', hashed_token: MAGIC_TOKEN, redirect_to: '', verification_type: 'magiclink' });
    routes['POST /auth/v1/verify'] = () => json(sessionJson());
    routes['GET /rest/v1/users'] = () => appUserRow('student');
  });

  it('signs in with the admission number alone, redeeming a one-time token on the request client', async () => {
    const { status, body } = await read(await studentLogin(postRequest('/api/auth/student/login', { admissionNumber: '  EM-2026-014 ' })));

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: USER_ID, role: 'STUDENT' });
    expect(state.cookieStore.jar.get(SESSION_COOKIE)).toMatch(/^base64-/);
    const link = requests.find((r) => r.url.includes('generate_link'))!;
    expect(await link.json()).toMatchObject({ type: 'magiclink', email: 'asha@example.com' });
    const verify = requests.find((r) => r.url.includes('/verify'))!;
    expect(verify.headers.get('authorization') ?? '').not.toContain('test-service-key');
    expect(await verify.json()).toMatchObject({ token_hash: MAGIC_TOKEN });
  });

  it('answers an unknown admission number with 401 and mints nothing', async () => {
    const { status, body } = await read(await studentLogin(postRequest('/api/auth/student/login', { admissionNumber: 'EM-0000' })));
    expect(status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(supabaseCalls()).toEqual(['GET /rest/v1/students']);
  });

  it('refuses a deactivated student before minting a token', async () => {
    routes['GET /rest/v1/students'] = () => json([{ user: { authUserId: AUTH_ID, email: 'asha@example.com', isActive: false } }]);
    const { status, body } = await read(await studentLogin(postRequest('/api/auth/student/login', { admissionNumber: 'EM-2026-014' })));
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(supabaseCalls()).toEqual(['GET /rest/v1/students']);
  });

  it('refuses an identity that is not a student and discards the new session', async () => {
    routes['GET /rest/v1/users'] = () => appUserRow('admin');
    const { status } = await read(await studentLogin(postRequest('/api/auth/student/login', { admissionNumber: 'EM-2026-014' })));
    expect(status).toBe(401);
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('rejects anything but an admission number with 422', async () => {
    for (const payload of [{}, { admissionNumber: '' }, { admissionNumber: 'EM-1', password: 'x' }]) {
      expect((await studentLogin(postRequest('/api/auth/student/login', payload))).status).toBe(422);
    }
    expect(requests).toEqual([]);
  });
});

// --- POST /api/auth/logout ------------------------------------------------------

describe('POST /api/auth/logout', () => {
  it('succeeds without a session and without calling Supabase', async () => {
    const { status, body } = await read(await logout(postRequest('/api/auth/logout')));
    expect(status).toBe(200);
    expect(body).toEqual({ data: { signedOut: true }, error: null });
    expect(requests).toEqual([]);
  });

  it('revokes the current session and clears its cookie', async () => {
    state.cookieStore = fakeCookieStore({ ...sessionCookie(), theme: 'dark' });

    const { status } = await read(await logout(postRequest('/api/auth/logout')));
    expect(status).toBe(200);

    const revoke = requests.find((r) => new URL(r.url).pathname === '/auth/v1/logout')!;
    expect(new URL(revoke.url).searchParams.get('scope')).toBe('local');
    expect(revoke.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
    expect(state.cookieStore.jar.get('theme')).toBe('dark');
  });

  it('succeeds for an expired or already-revoked session', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    routes['POST /auth/v1/logout'] = () => json({ code: 401, error_code: 'bad_jwt', msg: 'expired' }, 401);

    expect((await logout(postRequest('/api/auth/logout'))).status).toBe(200);
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('still clears cookies locally when Supabase is unreachable', async () => {
    state.cookieStore = fakeCookieStore({
      ...sessionCookie(),
      [`${SESSION_COOKIE}.1`]: 'chunk',
      [`${SESSION_COOKIE}-code-verifier`]: 'verifier',
    });
    routes['POST /auth/v1/logout'] = () => {
      throw new TypeError('fetch failed');
    };

    expect((await logout(postRequest('/api/auth/logout'))).status).toBe(200);
    expect([...state.cookieStore.jar.keys()]).toEqual([]);
  });

  it('clears cookies when an expired session cannot be refreshed because Supabase is down', async () => {
    // supabase-js returns early without touching storage here, so this
    // exercises the local cookie-clearing fallback.
    const expired = { ...sessionJson(), expires_at: Math.floor(Date.now() / 1000) - 60 };
    state.cookieStore = fakeCookieStore({
      [SESSION_COOKIE]: `base64-${Buffer.from(JSON.stringify(expired)).toString('base64url')}`,
    });
    routes['POST /auth/v1/token'] = () => {
      throw new TypeError('fetch failed');
    };

    // supabase-js retries the refresh with backoff for up to 30 s; fast-forward it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const pending = logout(postRequest('/api/auth/logout'));
      await vi.runAllTimersAsync();
      const { status } = await read(await pending);
      expect(status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
    expect(supabaseCalls().filter((call) => call === 'POST /auth/v1/token').length).toBeGreaterThan(1);
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('rejects cross-site logout attempts with 403', async () => {
    state.cookieStore = fakeCookieStore(sessionCookie());
    const request = postRequest('/api/auth/logout', undefined, { origin: 'https://evil.example' });

    expect((await logout(request)).status).toBe(403);
    expect(state.cookieStore.jar.has(SESSION_COOKIE)).toBe(true);
    expect(requests).toEqual([]);
  });
});
