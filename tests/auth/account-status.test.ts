import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { setAccountStatus } from '@/functions/account-status';
import type { AppUser } from '@/types/auth';

const ADMIN: AppUser = { id: '11111111-1111-4111-8111-111111111111', authUserId: 'a', role: 'ADMIN', isActive: true, fullName: 'Admin', email: 'admin@example.com' };
const TARGET = '22222222-2222-4222-8222-222222222222';

function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('setAccountStatus (unit)', () => {
  it("calls the status RPC with the actor's id, never a client-supplied one", async () => {
    const { client, rpc } = fakeClient({ data: { changed: true, revokedSessions: 2 }, error: null });
    await expect(setAccountStatus(TARGET, false, { actor: ADMIN, client: client as never })).resolves.toEqual({
      success: true,
      message: expect.any(String),
      data: { userId: TARGET, isActive: false, changed: true, revokedSessions: 2 },
    });
    expect(rpc).toHaveBeenCalledWith('setAppUserStatus', { userId: TARGET, isActive: false, actorUserId: ADMIN.id });
  });

  it.each([
    ['TEACHER', true],
    ['STUDENT', true],
    ['ADMIN', false],
  ] as const)('refuses a %s actor (active=%s) before calling the database', async (role, active) => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    const actor = { ...ADMIN, role, isActive: active } as unknown as AppUser;
    await expect(setAccountStatus(TARGET, false, { actor, client: client as never })).resolves.toMatchObject({ success: false, data: { status: 403 } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates the target id', async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    await expect(setAccountStatus('not-a-uuid', false, { actor: ADMIN, client: client as never })).resolves.toMatchObject({ success: false, data: { status: 400 } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', 404],
    ['SD001', 403],
    ['SD002', 409],
    ['42501', 403],
  ])('maps database error %s to %i', async (code, status) => {
    const { client } = fakeClient({ data: null, error: { code, message: 'raw' } });
    await expect(setAccountStatus(TARGET, false, { actor: ADMIN, client: client as never })).resolves.toMatchObject({ success: false, data: { status } });
  });

  it('does not report success for an unexpected RPC result', async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(setAccountStatus(TARGET, false, { actor: ADMIN, client: client as never })).resolves.toMatchObject({ success: false, data: { status: 500 } });
  });
});
