import 'server-only';
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';
import type { AuthError, User } from '@supabase/supabase-js';
import { z } from 'zod';
import { DB_USER_ROLES } from '@/constants/auth';
import { accountInactive, accountNotProvisioned, invalidCredentials, rateLimited, serviceUnavailable, unauthorized } from '@/helpers/api-error';
import { parseRow } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { logServerError } from '@/helpers/logger';
import { toAppRole } from '@/helpers/roles';
import { clearSupabaseAuthCookies } from '@/helpers/supabase-server';
import type { AppUser, AppUserRecord, PasswordCredentials, SessionProfile, SignInOptions } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/**
 * SESSIONS ON TOP OF SUPABASE AUTH. EVERY FUNCTION TAKES THE REQUEST-SCOPED
 * CLIENT FROM `createSupabaseServerClient()`.
 *
 * IDENTITY ALWAYS COMES FROM `supabase.auth.getUser()` (VALIDATED WITH THE
 * AUTH SERVER) AND THE ROLE ALWAYS COMES FROM THE DATABASE `users` ROW —
 * NEVER FROM REQUEST INPUT OR UNVERIFIED JWT CLAIMS.
 */

const appUserRowSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid(),
  role: z.enum(DB_USER_ROLES),
  isActive: z.boolean(),
  fullName: z.string(),
  // NULL FOR A STUDENT OR TEACHER ADDED WITHOUT AN EMAIL (MIGRATION 19).
  email: z.string().nullable(),
});

export function toSessionProfile(user: AppUser): SessionProfile {
  return { id: user.id, role: user.role, isActive: user.isActive, fullName: user.fullName, email: user.email };
}

/** TRUE FOR FAILURES OF THE AUTH SERVICE ITSELF RATHER THAN OF THE SESSION. */
function isAuthServiceFailure(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500);
}

/** THE APPLICATION `users` ROW LINKED TO A SUPABASE AUTH USER, IF ANY. RLS APPLIES. */
async function findAppUserByAuthUserId(client: DbClient, authUserId: string): Promise<AppUserRecord | null> {
  const result = await client
    .from('users')
    .select('id, authUserId, role, isActive, fullName, email')
    .eq('authUserId', authUserId)
    .maybeSingle();
  return parseRow('users.findByAuthUserId', result, appUserRowSchema);
}

/**
 * THE SUPABASE AUTH USER FOR THE CURRENT REQUEST, VALIDATED WITH THE AUTH
 * SERVER. `data` IS NULL FOR A MISSING, EXPIRED OR INVALID SESSION; FAILS
 * WITH 503 IF THE AUTH SERVICE CANNOT BE REACHED.
 */
export async function getAuthenticatedUser(client: DbClient): Promise<FunctionResult<User | null>> {
  try {
    const { data, error } = await client.auth.getUser();
    if (!error) return functionSuccess(data.user ?? null);
    if (isAuthSessionMissingError(error)) return functionSuccess(null);
    if (isAuthServiceFailure(error)) {
      logServerError('auth.getUser', error);
      throw serviceUnavailable();
    }
    // INVALID, EXPIRED OR REVOKED TOKEN: TREAT AS SIGNED OUT.
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'auth.getUser');
  }
}

/**
 * MAPS A VALIDATED SUPABASE AUTH USER ID TO ITS ACTIVE APPLICATION USER.
 * FAILS WITH 403 IF NO `users` ROW IS LINKED OR THE ACCOUNT IS DEACTIVATED.
 * NEVER CREATES A `users` ROW.
 */
async function resolveAppUser(client: DbClient, authUserId: string): Promise<FunctionResult<AppUser>> {
  try {
    const record = await findAppUserByAuthUserId(client, authUserId);
    if (!record) throw accountNotProvisioned();
    if (!record.isActive) throw accountInactive();
    return functionSuccess<AppUser>({
      id: record.id,
      authUserId: record.authUserId,
      role: toAppRole(record.role),
      isActive: true,
      fullName: record.fullName,
      email: record.email,
    });
  } catch (error) {
    return functionFailure(error, 'auth.resolveAppUser');
  }
}

/** THE ACTIVE APPLICATION USER FOR THE CURRENT REQUEST. 401 WITHOUT A VALID SESSION; 403 IF UNPROVISIONED OR INACTIVE. */
export async function getCurrentAppUser(client: DbClient): Promise<FunctionResult<AppUser>> {
  try {
    const authUser = unwrapResult(await getAuthenticatedUser(client));
    if (!authUser) throw unauthorized();
    return functionSuccess(unwrapResult(await resolveAppUser(client, authUser.id)));
  } catch (error) {
    return functionFailure(error, 'auth.currentUser');
  }
}

/**
 * ENDS THE CURRENT SESSION (THIS DEVICE ONLY) AND CLEARS ITS COOKIES. SAFE
 * WITHOUT A SESSION. IF SUPABASE CANNOT REVOKE THE SESSION, THE AUTH COOKIES
 * ARE STILL CLEARED LOCALLY SO THE BROWSER IS SIGNED OUT.
 */
export async function signOutCurrentSession(client: DbClient): Promise<FunctionResult<null>> {
  try {
    let isRevoked = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) {
        isRevoked = false;
        logServerError('auth.signOut', error);
      }
    } catch (signOutError) {
      isRevoked = false;
      logServerError('auth.signOut', signOutError);
    }
    if (!isRevoked) await clearSupabaseAuthCookies();
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'auth.signOut');
  }
}

/**
 * THE APPLICATION USER BEHIND A SESSION THAT WAS JUST STARTED ON `client`.
 * IF THE ACCOUNT IS NOT PROVISIONED OR INACTIVE (403), OR IS NOT `options.role`
 * (THE SAME 401 AS WRONG CREDENTIALS, SO A SIGN-IN FORM DOES NOT REVEAL OTHER
 * ROLES' ACCOUNTS), THE NEW SESSION IS DISCARDED FIRST.
 */
export async function acceptNewSession(
  client: DbClient,
  authUserId: string,
  options: SignInOptions = {},
): Promise<FunctionResult<AppUser>> {
  try {
    const appUser = await resolveAppUser(client, authUserId);
    const isWrongRole = appUser.success && options.role !== undefined && appUser.data.role !== options.role;
    if (appUser.success && !isWrongRole) return appUser;
    await signOutCurrentSession(client);
    if (isWrongRole) throw invalidCredentials(options.credentialMessage);
    return appUser;
  } catch (error) {
    return functionFailure(error, 'auth.acceptSession');
  }
}

/**
 * SIGNS IN WITH EMAIL + PASSWORD AND RETURNS THE LINKED APPLICATION USER.
 * SESSION COOKIES ARE WRITTEN BY THE CLIENT'S `setAll` HANDLER.
 *
 * EVERY CREDENTIAL FAILURE (WRONG PASSWORD, UNKNOWN OR UNCONFIRMED EMAIL,
 * BANNED USER, ANOTHER ROLE'S ACCOUNT) IS THE SAME 401, SO RESPONSES DO NOT
 * REVEAL WHICH ACCOUNTS EXIST. IF THE AUTH USER IS VALID BUT NOT PROVISIONED
 * OR INACTIVE, THE NEW SESSION IS DISCARDED BEFORE THE 403 IS RETURNED.
 */
export async function signInWithPassword(
  client: DbClient,
  credentials: PasswordCredentials,
  options: SignInOptions = {},
): Promise<FunctionResult<AppUser>> {
  try {
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error) {
      if (isAuthApiError(error) && error.status === 429) throw rateLimited();
      if (isAuthServiceFailure(error)) {
        logServerError('auth.signIn', error);
        throw serviceUnavailable();
      }
      throw invalidCredentials(options.credentialMessage);
    }
    if (!data.user) throw invalidCredentials(options.credentialMessage);
    return await acceptNewSession(client, data.user.id, options);
  } catch (error) {
    return functionFailure(error, 'auth.signIn');
  }
}
