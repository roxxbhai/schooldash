import { fakeCookieStore } from '../../helpers/fake-cookies';
import { POST as studentLogin } from '@/app/api/auth/student/login/route';
import { POST as teacherSignUp } from '@/app/api/auth/teacher/sign-up/route';
import { signInWithPassword } from '@/functions/session';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * Calls Route Handlers in-process against the REAL Supabase project. Only the
 * Next.js request cookie store is simulated; each signed-in actor keeps its
 * own store, so tokens refreshed during a call stay with that actor.
 *
 * The test file must mock `next/headers` to return `state.cookies`:
 *   const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
 *   vi.mock("next/headers", () => ({ cookies: async () => state.cookies }));
 *   vi.mock("next/server", async (o) => ({ ...(await o<typeof import("next/server")>()), connection: async () => {} }));
 */

export type CookieStore = ReturnType<typeof fakeCookieStore>;
export const APP = 'http://localhost:3000';

export interface Harness {
  state: { cookies: CookieStore };
}

export interface ApiResult {
  status: number;
  body: { data: any; error: { code: string; message: string; details?: { path: string; message: string }[] } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

export const anonymous = (): CookieStore => fakeCookieStore();

/**
 * A REAL SESSION FOR ANY ROLE, FROM THE EMAIL + PASSWORD OF A TEST IDENTITY.
 * TEST-ONLY SHORTCUT: THE APP'S SIGN-IN ROUTES EACH ACCEPT ONE ROLE AND ITS OWN
 * CREDENTIALS (tests/integration/sign-in.test.ts COVERS THEM).
 */
export async function signIn(harness: Harness, email: string, password: string): Promise<CookieStore> {
  const store = fakeCookieStore();
  harness.state.cookies = store;
  const result = await signInWithPassword(await createSupabaseServerClient(), { email, password });
  if (!result.success) throw new Error(`sign-in failed with ${result.data.status}`);
  return store;
}

/** A REAL STUDENT SESSION THROUGH POST /api/auth/student/login (ADMISSION NUMBER ONLY). */
export async function signInAsStudent(harness: Harness, admissionNumber: string): Promise<CookieStore> {
  const store = fakeCookieStore();
  const result = await call(harness, store, studentLogin, 'POST', '/api/auth/student/login', { body: { admissionNumber } });
  if (result.status !== 200) throw new Error(`student sign-in failed with ${result.status}`);
  return store;
}

/** A TEACHER'S ONE-TIME SIGN-UP THROUGH POST /api/auth/teacher/sign-up; RETURNS THE NEW SESSION. */
export async function signUpAsTeacher(harness: Harness, phone: string, password: string): Promise<CookieStore> {
  const store = fakeCookieStore();
  const result = await call(harness, store, teacherSignUp, 'POST', '/api/auth/teacher/sign-up', { body: { phone, password } });
  if (result.status !== 200) throw new Error(`teacher sign-up failed with ${result.status}`);
  return store;
}

export async function call(
  harness: Harness,
  as: CookieStore,
  handler: unknown,
  method: string,
  path: string,
  options: { body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  harness.state.cookies = as;
  const hasBody = options.body !== undefined;
  const request = new Request(`${APP}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: APP }),
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const response = await (handler as Handler)(request, { params: Promise.resolve(options.params ?? {}) });
  return { status: response.status, body: await response.json() };
}
