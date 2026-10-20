import { authUser, fakeSupabase } from '../helpers/fake-supabase';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedUser, getCurrentAppUser, toSessionProfile } from '@/functions/session';
import { unwrapResult } from '@/helpers/function-result';
import type { FunctionFailureData, FunctionResult } from '@/types/function-result';

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  authUserId: AUTH_ID,
  role: 'student',
  isActive: true,
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  ...overrides,
});

/** THE FAILURE A FUNCTION REPORTED (AND THE TEST FAILS IF IT SUCCEEDED). */
async function captureApiError(pending: Promise<FunctionResult<unknown>>): Promise<FunctionFailureData & { message: string }> {
  const result = await pending;
  if (result.success) throw new Error('Expected a failure result');
  return { ...result.data, message: result.message };
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('getAuthenticatedUser', () => {
  it('returns null when there is no session', async () => {
    const { client } = fakeSupabase({ authError: new AuthSessionMissingError() });
    await expect(getAuthenticatedUser(client)).resolves.toMatchObject({ success: true, data: null });
  });

  it.each([
    ['an invalid JWT', new AuthApiError('invalid JWT', 401, 'bad_jwt')],
    ['a revoked session', new AuthApiError('session not found', 403, 'session_not_found')],
    ['a deleted user', new AuthApiError('user not found', 404, 'user_not_found')],
  ])('returns null for %s', async (_label, error) => {
    const { client } = fakeSupabase({ authError: error });
    await expect(getAuthenticatedUser(client)).resolves.toMatchObject({ success: true, data: null });
  });

  it('throws 503 when the Auth service is unreachable or failing', async () => {
    for (const error of [
      new AuthRetryableFetchError('fetch failed', 0),
      new AuthApiError('upstream', 502, undefined),
    ]) {
      const { client } = fakeSupabase({ authError: error });
      const apiError = await captureApiError(getAuthenticatedUser(client));
      expect(apiError.status).toBe(503);
    }
  });

  it('returns the user validated by auth.getUser()', async () => {
    const user = authUser(AUTH_ID);
    const { client } = fakeSupabase({ user });
    expect(unwrapResult(await getAuthenticatedUser(client))).toBe(user);
  });
});

describe('getCurrentAppUser', () => {
  it('rejects a missing session with 401', async () => {
    const { client } = fakeSupabase({ authError: new AuthSessionMissingError() });
    const error = await captureApiError(getCurrentAppUser(client));
    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid session with 401', async () => {
    const { client } = fakeSupabase({ authError: new AuthApiError('bad', 401, 'bad_jwt') });
    expect((await captureApiError(getCurrentAppUser(client))).status).toBe(401);
  });

  it('resolves a valid session to its application user and role', async () => {
    const { client, queries } = fakeSupabase({
      user: authUser(AUTH_ID),
      tables: { users: [userRow({ role: 'teacher' })] },
    });

    expect(unwrapResult(await getCurrentAppUser(client))).toEqual({
      id: USER_ID,
      authUserId: AUTH_ID,
      role: 'TEACHER',
      isActive: true,
      fullName: 'Asha Verma',
      email: 'asha@example.com',
    });
    expect(queries).toEqual([
      {
        table: 'users',
        columns: 'id, authUserId, role, isActive, fullName, email',
        filters: [['authUserId', AUTH_ID]],
      },
    ]);
  });

  it('rejects an Auth user with no application users row (403) and never creates one', async () => {
    const { client, queries } = fakeSupabase({ user: authUser(AUTH_ID), tables: { users: [] } });
    const error = await captureApiError(getCurrentAppUser(client));
    expect(error.status).toBe(403);
    expect(error.code).toBe('ACCOUNT_NOT_PROVISIONED');
    expect(queries.map((q) => q.table)).toEqual(['users']);
  });

  it('rejects an inactive application user with 403', async () => {
    const { client } = fakeSupabase({
      user: authUser(AUTH_ID),
      tables: { users: [userRow({ isActive: false })] },
    });
    const error = await captureApiError(getCurrentAppUser(client));
    expect(error.status).toBe(403);
    expect(error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('takes the role from the database, ignoring roles in Auth metadata', async () => {
    const { client } = fakeSupabase({
      user: authUser(AUTH_ID, { role: 'ADMIN' }),
      tables: { users: [userRow({ role: 'student' })] },
    });
    expect(unwrapResult(await getCurrentAppUser(client)).role).toBe('STUDENT');
  });

  it('surfaces query failures as DataAccessError, never as a partial user', async () => {
    const { client } = fakeSupabase({
      user: authUser(AUTH_ID),
      failingTables: { users: '42501' },
    });
    // A FAILED OR MALFORMED LOOKUP IS A GENERIC 500 — NEVER A PARTIAL USER.
    await expect(getCurrentAppUser(client)).resolves.toMatchObject({ success: false, data: { status: 500, code: 'INTERNAL_ERROR' } });
  });

  it('rejects rows with an unexpected shape', async () => {
    const { client } = fakeSupabase({
      user: authUser(AUTH_ID),
      tables: { users: [userRow({ role: 'superuser' })] },
    });
    // A FAILED OR MALFORMED LOOKUP IS A GENERIC 500 — NEVER A PARTIAL USER.
    await expect(getCurrentAppUser(client)).resolves.toMatchObject({ success: false, data: { status: 500, code: 'INTERNAL_ERROR' } });
  });
});

describe('toSessionProfile', () => {
  it('exposes id, role, isActive, name and email, never the Auth user id', () => {
    expect(
      toSessionProfile({ id: USER_ID, authUserId: AUTH_ID, role: 'ADMIN', isActive: true, fullName: 'Asha Verma', email: 'asha@example.com' }),
    ).toEqual({ id: USER_ID, role: 'ADMIN', isActive: true, fullName: 'Asha Verma', email: 'asha@example.com' });
  });
});
