import "server-only";
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  accountInactive,
  accountNotProvisioned,
  invalidCredentials,
  rateLimited,
  serviceUnavailable,
  unauthorized,
} from "@/lib/api/errors";
import { logServerError } from "@/lib/api/log";
import { findAppUserByAuthUserId } from "@/lib/auth/repository";
import { toAppRole } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { clearSupabaseAuthCookies } from "@/lib/supabase/server";

/**
 * Session handling on top of Supabase Auth. All functions take the
 * request-scoped client from `createSupabaseServerClient()`.
 *
 * Identity always comes from `supabase.auth.getUser()` (which validates the
 * access token with the Auth server) and the role always comes from the
 * database `users` row — never from request input or unverified JWT claims.
 */

/** An active, provisioned application user for the current request. */
export interface AppUser {
  id: string;
  authUserId: string;
  role: AppRole;
  isActive: true;
}

/** The fields returned to clients by /api/auth/me and /api/auth/login. */
export interface SessionProfile {
  id: string;
  role: AppRole;
  isActive: boolean;
}

export function toSessionProfile(user: AppUser): SessionProfile {
  return { id: user.id, role: user.role, isActive: user.isActive };
}

/** True for failures of the Auth service itself rather than of the session. */
function isAuthServiceFailure(error: AuthError): boolean {
  return (
    isAuthRetryableFetchError(error) ||
    (isAuthApiError(error) && error.status >= 500)
  );
}

/**
 * The Supabase Auth user for the current request, validated with the Auth
 * server. Returns `null` for a missing, expired, or invalid session; throws
 * 503 if the Auth service cannot be reached.
 */
export async function getAuthenticatedUser(client: SupabaseClient<Database>): Promise<User | null> {
  const { data, error } = await client.auth.getUser();

  if (error) {
    if (isAuthSessionMissingError(error)) return null;
    if (isAuthServiceFailure(error)) {
      logServerError("auth.getUser", error);
      throw serviceUnavailable();
    }
    return null; // invalid/expired/revoked token: treat as signed out
  }

  return data.user ?? null;
}

/**
 * Maps a validated Supabase Auth user id to its active application user.
 * Throws 403 if no `users` row is linked or the account is deactivated.
 * Never creates a `users` row.
 */
export async function resolveAppUser(
  client: SupabaseClient<Database>,
  authUserId: string,
): Promise<AppUser> {
  const record = await findAppUserByAuthUserId(client, authUserId);
  if (!record) throw accountNotProvisioned();
  if (!record.isActive) throw accountInactive();

  return {
    id: record.id,
    authUserId: record.authUserId,
    role: toAppRole(record.role),
    isActive: true,
  };
}

/**
 * The active application user for the current request.
 * 401 without a valid session; 403 if unprovisioned or inactive.
 */
export async function getCurrentAppUser(client: SupabaseClient<Database>): Promise<AppUser> {
  const authUser = await getAuthenticatedUser(client);
  if (!authUser) throw unauthorized();
  return resolveAppUser(client, authUser.id);
}

export interface PasswordCredentials {
  email: string;
  password: string;
}

/**
 * Signs in with email + password and returns the linked application user.
 * Session cookies are written by the client's `setAll` handler.
 *
 * Every credential-related failure (wrong password, unknown or unconfirmed
 * email, banned user) maps to the same 401 so responses do not reveal which
 * accounts exist. If the Auth user is valid but not provisioned or inactive,
 * the new session is discarded before the 403 is returned.
 */
export async function signInWithPassword(
  client: SupabaseClient<Database>,
  credentials: PasswordCredentials,
): Promise<AppUser> {
  const { data, error } = await client.auth.signInWithPassword(credentials);

  if (error) {
    if (isAuthApiError(error) && error.status === 429) throw rateLimited();
    if (isAuthServiceFailure(error)) {
      logServerError("auth.signIn", error);
      throw serviceUnavailable();
    }
    throw invalidCredentials();
  }
  if (!data.user) throw invalidCredentials();

  try {
    return await resolveAppUser(client, data.user.id);
  } catch (resolveError) {
    await signOutCurrentSession(client);
    throw resolveError;
  }
}

/**
 * Ends the current session (this device only) and clears its cookies.
 * Safe to call without a session. If Supabase cannot revoke the session, the
 * auth cookies are still cleared locally so the browser is signed out.
 */
export async function signOutCurrentSession(client: SupabaseClient<Database>): Promise<void> {
  let failed = false;
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) {
      failed = true;
      logServerError("auth.signOut", error);
    }
  } catch (error) {
    failed = true;
    logServerError("auth.signOut", error);
  }

  if (failed) await clearSupabaseAuthCookies();
}
