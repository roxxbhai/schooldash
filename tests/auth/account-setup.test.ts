import { AuthApiError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH } from '@/constants/account-setup';
import { completeAccountSetup, issueSetupCode } from '@/functions/account-setup';
import { formatSetupCode, generateSetupCode, hashSetupCode, normalizeSetupCode } from '@/helpers/account-setup';
import type { AppUser } from '@/types/auth';

const ADMIN: AppUser = { id: '11111111-1111-4111-8111-111111111111', authUserId: 'a', role: 'ADMIN', isActive: true, fullName: 'Admin', email: 'admin@example.com' };
const USER_ID = '22222222-2222-4222-8222-222222222222';
const AUTH_ID = '33333333-3333-4333-8333-333333333333';
const INPUT = { email: 'asha@example.com', code: '7k2m q9tb-4hxd', password: 'a-long-enough-password' };
const VALID = { status: 'valid', userId: USER_ID, authUserId: AUTH_ID, expiresAt: '2026-10-27T00:00:00.000Z', failedAttempts: 1 };

/** THE SECRET-KEY CLIENT: THE TWO RPCS, THE PASSWORD UPDATE, AND THE RESTORE UPSERT. */
function fakeAdmin(rpcResult: { data: unknown; error: unknown }, updateError: unknown = null) {
  const rpc = vi.fn(async () => rpcResult);
  const updateUserById = vi.fn(async () => ({ data: { user: null }, error: updateError }));
  const upsert = vi.fn(async () => ({ error: null }));
  const client = { rpc, auth: { admin: { updateUserById } }, from: vi.fn(() => ({ upsert })) };
  return { client: client as never, rpc, updateUserById, upsert };
}

/** THE REQUEST-SCOPED CLIENT USED TO SIGN IN AFTER THE PASSWORD IS SET. */
function fakeSession(isSignInOk = true) {
  const signInWithPassword = vi.fn(async () =>
    isSignInOk
      ? { data: { user: { id: AUTH_ID } }, error: null }
      : { data: { user: null }, error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') },
  );
  const row = { id: USER_ID, authUserId: AUTH_ID, role: 'admin', isActive: true, fullName: 'Asha Verma', email: INPUT.email };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  const client = { auth: { signInWithPassword, signOut: vi.fn(async () => ({ error: null })) }, from: () => query };
  return { client: client as never, signInWithPassword };
}

describe('setup code helpers', () => {
  it('generates 12 characters from the unambiguous alphabet', () => {
    const codes = Array.from({ length: 50 }, generateSetupCode);
    for (const code of codes) {
      expect(code).toHaveLength(SETUP_CODE_LENGTH);
      expect([...code].every((char) => SETUP_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('formats in groups of four and normalizes what people type', () => {
    expect(formatSetupCode('7K2MQ9TB4HXD')).toBe('7K2M-Q9TB-4HXD');
    expect(normalizeSetupCode(' 7k2m q9tb-4hxd ')).toBe('7K2MQ9TB4HXD');
    // LOOK-ALIKE LETTERS THE ALPHABET EXCLUDES ARE READ AS THE DIGITS THEY RESEMBLE.
    expect(normalizeSetupCode('oOiIlL')).toBe('001111');
  });

  it('hashes to 64 hex characters, deterministically', () => {
    expect(hashSetupCode('7K2MQ9TB4HXD')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSetupCode('7K2MQ9TB4HXD')).toBe(hashSetupCode(normalizeSetupCode('7k2m-q9tb-4hxd')));
  });
});

describe('issueSetupCode (unit)', () => {
  it('stores only the hash, with the actor from the session, and returns the formatted code once', async () => {
    const { client, rpc } = fakeAdmin({ data: null, error: null });
    const result = await issueSetupCode(USER_ID, { actor: ADMIN, client });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(rpc).toHaveBeenCalledWith('issueAccountSetupCode', expect.objectContaining({ userId: USER_ID, actorUserId: ADMIN.id }));
    expect(args.codeHash).toBe(hashSetupCode(normalizeSetupCode(result.data.code)));
    expect(JSON.stringify(args)).not.toContain(normalizeSetupCode(result.data.code));
  });

  it('expires the code in seven days', async () => {
    const { client } = fakeAdmin({ data: null, error: null });
    const result = await issueSetupCode(USER_ID, { actor: ADMIN, client });
    if (!result.success) throw new Error('expected success');
    const days = (Date.parse(result.data.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it.each(['TEACHER', 'STUDENT'] as const)('refuses a %s actor before calling the database', async (role) => {
    const { client, rpc } = fakeAdmin({ data: null, error: null });
    await expect(issueSetupCode(USER_ID, { actor: { ...ADMIN, role }, client })).resolves.toMatchObject({ success: false, data: { status: 403 } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', 404],
    ['SD003', 403],
    ['SD004', 409],
  ])('maps database error %s to %i', async (code, status) => {
    const { client } = fakeAdmin({ data: null, error: { code, message: 'raw' } });
    await expect(issueSetupCode(USER_ID, { actor: ADMIN, client })).resolves.toMatchObject({ success: false, data: { status } });
  });
});

describe('completeAccountSetup (unit)', () => {
  it('consumes the normalized code, sets the password and signs in', async () => {
    const admin = fakeAdmin({ data: VALID, error: null });
    const session = fakeSession();
    const result = await completeAccountSetup(session.client, INPUT, { adminClient: admin.client });
    expect(result).toEqual({
      success: true,
      message: expect.any(String),
      data: { isSignedIn: true, profile: { id: USER_ID, role: 'ADMIN', isActive: true, fullName: 'Asha Verma', email: INPUT.email } },
    });
    expect(admin.rpc).toHaveBeenCalledWith('consumeAccountSetupCode', { email: INPUT.email, codeHash: hashSetupCode('7K2MQ9TB4HXD') });
    expect(admin.updateUserById).toHaveBeenCalledWith(AUTH_ID, { password: INPUT.password });
    expect(session.signInWithPassword).toHaveBeenCalledWith({ email: INPUT.email, password: INPUT.password });
  });

  it('returns one 401 for any invalid code, and changes no password', async () => {
    const admin = fakeAdmin({ data: { status: 'invalid' }, error: null });
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({
      success: false,
      message: 'The email or setup code is incorrect, or the code has expired.',
      data: { status: 401, code: 'INVALID_SETUP_CODE' },
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account with 403', async () => {
    const admin = fakeAdmin({ data: { status: 'inactive' }, error: null });
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({
      success: false,
      data: { status: 403, code: 'ACCOUNT_INACTIVE' },
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it('restores the code and reports a field error when Auth rejects the password as weak', async () => {
    const weak = new AuthWeakPasswordError('weak', 422, ['pwned']);
    const admin = fakeAdmin({ data: VALID, error: null }, weak);
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({
      success: false,
      data: { status: 422, code: 'VALIDATION_ERROR', details: [{ path: 'password' }] },
    });
    expect(admin.upsert).toHaveBeenCalledWith(
      { userId: USER_ID, codeHash: hashSetupCode('7K2MQ9TB4HXD'), expiresAt: VALID.expiresAt, failedAttempts: 1 },
      { onConflict: 'userId', ignoreDuplicates: true },
    );
  });

  it('restores the code and returns 503 when Auth is failing', async () => {
    const admin = fakeAdmin({ data: VALID, error: null }, new AuthApiError('upstream', 502, 'unexpected_failure'));
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({ success: false, data: { status: 503, code: 'SERVICE_UNAVAILABLE' } });
    expect(admin.upsert).toHaveBeenCalled();
  });

  it('restores the code and returns a generic 500 for any other Auth rejection', async () => {
    const admin = fakeAdmin({ data: VALID, error: null }, new AuthApiError('nope', 400, 'validation_failed'));
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({ success: false, data: { status: 500, code: 'INTERNAL_ERROR' } });
    expect(admin.upsert).toHaveBeenCalled();
  });

  it('still succeeds, signed out, if only the final sign-in fails', async () => {
    const admin = fakeAdmin({ data: VALID, error: null });
    await expect(completeAccountSetup(fakeSession(false).client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({
      success: true,
      data: { isSignedIn: false, profile: null },
    });
  });

  it('fails safely when the database is unreachable', async () => {
    const admin = fakeAdmin({ data: null, error: { code: '', message: 'fetch failed' } });
    await expect(completeAccountSetup(fakeSession().client, INPUT, { adminClient: admin.client })).resolves.toMatchObject({ success: false, data: { status: 503 } });
  });
});
