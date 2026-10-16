import { fakeCookieStore } from '../../helpers/fake-cookies';
import { POST as login } from '@/app/api/auth/login/route';

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

export async function signIn(harness: Harness, email: string, password: string): Promise<CookieStore> {
  const store = fakeCookieStore();
  harness.state.cookies = store;
  const response = await login(
    new Request(`${APP}/api/auth/login`, {
      method: 'POST',
      headers: { origin: APP, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (response.status !== 200) throw new Error(`sign-in failed with ${response.status}`);
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
