import { vi } from 'vitest';
import type { AppRole, AppUser } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';

/**
 * CALLS REAL ROUTE HANDLERS IN UNIT TESTS, WITHOUT SUPABASE.
 *
 * THE TEST FILE MUST MOCK THESE MODULES (vi.mock IS HOISTED, SO IT CANNOT LIVE HERE):
 *   vi.mock('next/server', async (o) => ({ ...(await o<typeof import('next/server')>()), connection: async () => {} }));
 *   vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
 *   vi.mock('@/functions/authorization', async (o) => ({ ...(await o<typeof import('@/functions/authorization')>()), ...guardMocks() }));
 * THEN `useClient(fake.client)` AND `actAs(user)` BEFORE EACH CALL. THE GUARD
 * STUBS APPLY THE SAME ROLE RULES AS THE REAL GUARDS; THEIR REAL BEHAVIOUR IS
 * COVERED BY tests/auth AND THE INTEGRATION SUITE.
 */

const APP = 'http://localhost:3000';
const state: { user: AppUser | null } = { user: null };

export function makeUser(role: AppRole, id: string): AppUser {
  return { id, authUserId: `auth-${id}`, role, isActive: true };
}

export function actAs(user: AppUser | null): void {
  state.user = user;
}

function guardResult(allowedRoles?: readonly AppRole[]): FunctionResult<AppUser> {
  if (!state.user) return { success: false, message: 'Authentication is required.', data: { status: 401, code: 'UNAUTHORIZED' } };
  if (allowedRoles && !allowedRoles.includes(state.user.role)) {
    return { success: false, message: 'You do not have permission to perform this action.', data: { status: 403, code: 'FORBIDDEN' } };
  }
  return { success: true, message: 'Operation successful', data: state.user };
}

/** REPLACEMENTS FOR THE ROUTE GUARDS IN @/functions/authorization. */
export function guardMocks() {
  return {
    requireAuthenticatedUser: vi.fn(async function requireAuthenticatedUserStub() {
      return guardResult();
    }),
    requireAdmin: vi.fn(async function requireAdminStub() {
      return guardResult(['ADMIN']);
    }),
    requireRole: vi.fn(async function requireRoleStub(_client: unknown, roles: readonly AppRole[]) {
      return guardResult(roles);
    }),
  };
}

export interface RouteResult {
  status: number;
  body: { data: any; error: { code: string; message: string; details?: { path: string; message: string }[] } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** INVOKES A ROUTE HANDLER WITH A SAME-ORIGIN REQUEST AND RETURNS STATUS + JSON BODY. */
export async function callRoute(
  handler: unknown,
  options: { method?: string; path?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<RouteResult> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const hasBody = options.body !== undefined;
  const request = new Request(`${APP}${options.path ?? '/api/test'}`, {
    method,
    headers: { ...(method === 'GET' ? {} : { origin: APP }), ...(hasBody ? { 'content-type': 'application/json' } : {}) },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const response = await (handler as Handler)(request, { params: Promise.resolve(options.params ?? {}) });
  return { status: response.status, body: await response.json() };
}
