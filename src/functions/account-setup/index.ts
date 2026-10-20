import 'server-only';
import { isAuthApiError, isAuthRetryableFetchError, isAuthWeakPasswordError } from '@supabase/supabase-js';
import { z } from 'zod';
import { SETUP_CODE_VALIDITY_DAYS } from '@/constants/account-setup';
import { accountInactive, DataAccessError, forbidden, invalidSetupCode, rateLimited, serviceUnavailable, validationError } from '@/helpers/api-error';
import { formatSetupCode, generateSetupCode, hashSetupCode, normalizeSetupCode } from '@/helpers/account-setup';
import { rpcResult } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { logServerError } from '@/helpers/logger';
import { assertUuid } from '@/helpers/request-validation';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import { signInWithPassword, toSessionProfile } from '@/functions/session';
import type { AccountSetupInput, AccountSetupOutcome, IssuedSetupCode } from '@/types/account-setup';
import type { AppUser } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/**
 * ADMIN-ISSUED ACCOUNT SETUP CODES (MIGRATION 13).
 *
 * TEACHERS AND STUDENTS ARE PROVISIONED WITHOUT A PASSWORD. AN ADMIN HANDS
 * THEM A ONE-TIME CODE; ON THE PUBLIC SETUP PAGE THEY ENTER THEIR EMAIL, THE
 * CODE AND A NEW PASSWORD. A NEW CODE FOR AN EXISTING ACCOUNT ACTS AS AN
 * ADMIN-ISSUED PASSWORD RESET.
 *
 * ONLY THE SECRET-KEY CLIENT CAN READ THE CODES TABLE OR CALL ITS FUNCTIONS.
 * ISSUING IS ONLY CALLED FROM ADMIN-GUARDED ROUTES; COMPLETING SETUP IS PUBLIC,
 * BUT NEEDS A VALID CODE, AND EVERY KIND OF FAILURE RETURNS THE SAME 401.
 */

const consumeResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('valid'),
    userId: z.uuid(),
    authUserId: z.uuid(),
    expiresAt: z.string(),
    failedAttempts: z.number().int(),
  }),
  z.object({ status: z.literal('inactive') }),
  z.object({ status: z.literal('invalid') }),
]);

const ISSUE_ERRORS = { notFoundMessage: 'User not found.' };

/** ISSUES (OR REPLACES) THE SETUP CODE OF AN ACTIVE TEACHER OR STUDENT. THE PLAIN CODE IS RETURNED ONCE. */
export async function issueSetupCode(
  userId: string,
  options: { actor: AppUser; client?: DbClient },
): Promise<FunctionResult<IssuedSetupCode>> {
  try {
    // DEFENSE IN DEPTH: THE ROUTE ALREADY RAN requireAdmin().
    if (options.actor.role !== 'ADMIN' || !options.actor.isActive) throw forbidden();
    const targetId = assertUuid(userId, 'id');

    const code = generateSetupCode();
    const expiresAt = new Date(Date.now() + SETUP_CODE_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const admin = options.client ?? createSupabaseAdminClient();
    await rpcResult(
      'users.issueSetupCode',
      admin.rpc('issueAccountSetupCode', {
        userId: targetId,
        codeHash: hashSetupCode(code),
        expiresAt,
        actorUserId: options.actor.id,
      }),
      ISSUE_ERRORS,
    );
    return functionSuccess({ code: formatSetupCode(code), expiresAt });
  } catch (error) {
    return functionFailure(error, 'users.issueSetupCode');
  }
}

/**
 * CONSUMES A SETUP CODE, SETS THE PASSWORD, AND SIGNS THE PERSON IN ON
 * `client` (THE REQUEST-SCOPED CLIENT, SO SESSION COOKIES ARE WRITTEN).
 *
 * THE CODE IS CONSUMED ATOMICALLY BEFORE THE PASSWORD IS SET, SO TWO
 * CONCURRENT REQUESTS CANNOT BOTH USE IT. IF SETTING THE PASSWORD FAILS, THE
 * CODE IS RESTORED SO THE PERSON CAN TRY AGAIN.
 */
export async function completeAccountSetup(
  client: DbClient,
  input: AccountSetupInput,
  options: { adminClient?: DbClient } = {},
): Promise<FunctionResult<AccountSetupOutcome>> {
  try {
    const admin = options.adminClient ?? createSupabaseAdminClient();
    const codeHash = hashSetupCode(normalizeSetupCode(input.code));
    const consumed = consumeResultSchema.parse(
      await rpcResult('users.consumeSetupCode', admin.rpc('consumeAccountSetupCode', { email: input.email, codeHash })),
    );

    switch (consumed.status) {
      case 'invalid':
        throw invalidSetupCode();
      case 'inactive':
        throw accountInactive();
    }

    const { error } = await admin.auth.admin.updateUserById(consumed.authUserId, { password: input.password });
    if (error) {
      await restoreSetupCode(admin, { userId: consumed.userId, codeHash, expiresAt: consumed.expiresAt, failedAttempts: consumed.failedAttempts });
      if (isAuthWeakPasswordError(error)) {
        throw validationError([{ path: 'password', message: 'This password is too easy to guess. Choose a longer one with a mix of words, numbers or symbols.' }]);
      }
      if (isAuthApiError(error) && error.status === 429) throw rateLimited();
      if (isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500)) {
        logServerError('auth.updateUserPassword', error);
        throw serviceUnavailable();
      }
      throw new DataAccessError('auth.updateUserPassword', error.code ?? 'UNKNOWN');
    }

    const signedIn = await signInWithPassword(client, { email: input.email, password: input.password });
    if (!signedIn.success) {
      logServerError('auth.setupSignIn', new Error(signedIn.message));
      return functionSuccess({ isSignedIn: false, profile: null });
    }
    return functionSuccess({ isSignedIn: true, profile: toSessionProfile(unwrapResult(signedIn)) });
  } catch (error) {
    return functionFailure(error, 'users.completeSetup');
  }
}

/** PUTS A CONSUMED CODE BACK AFTER A FAILED PASSWORD UPDATE. BEST EFFORT: A FAILURE IS LOGGED, AND THE ADMIN CAN ISSUE A NEW CODE. */
async function restoreSetupCode(
  admin: DbClient,
  row: { userId: string; codeHash: string; expiresAt: string; failedAttempts: number },
): Promise<void> {
  const { error } = await admin.from('accountSetupCodes').upsert(row, { onConflict: 'userId', ignoreDuplicates: true });
  if (error) logServerError('users.restoreSetupCode', error);
}
