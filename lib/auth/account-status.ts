import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forbidden } from "@/lib/api/errors";
import { assertUuid } from "@/lib/api/validation";
import { rpcResult } from "@/lib/db/query";
import type { AppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Trusted, server-only account deactivation and reactivation.
 *
 * Status is changed by `public."setAppUserStatus"` in ONE transaction: the
 * users row ("isActive" + "deactivatedAt"), deletion of the user's Supabase
 * Auth sessions (on deactivation), and the audit entry. Only the
 * secret-key client may call it; callers must pass the admin performing the
 * change, obtained from `requireAdmin()`.
 *
 * Effect on a deactivated user who is signed in:
 *   - their refresh tokens are revoked immediately (sessions deleted);
 *   - every API request is rejected: `getUser()` fails for a deleted session
 *     (401) and `isActive = false` is checked on every request (403);
 *   - RLS denies all school data to inactive users at the database level;
 *   - an access token already issued stays cryptographically valid until it
 *     expires (≤ 1 h by default), but it can only read the user's own `users`
 *     row through the Data API.
 *
 * History (student/teacher profiles, enrollments, attendance, results, audit
 * logs) is never modified.
 */

export interface AccountStatusResult {
  userId: string;
  isActive: boolean;
  /** False when the account was already in the requested state (no audit entry). */
  changed: boolean;
  /** Auth sessions revoked by a deactivation. */
  revokedSessions: number;
}

const rpcResultSchema = z.object({ changed: z.boolean(), revokedSessions: z.number().int() });

export async function setAccountStatus(
  userId: string,
  isActive: boolean,
  options: { actor: AppUser; client?: SupabaseClient<Database> },
): Promise<AccountStatusResult> {
  // Defense in depth: the route already ran requireAdmin().
  if (options.actor.role !== "ADMIN" || !options.actor.isActive) throw forbidden();
  const targetId = assertUuid(userId, "id");

  const admin = options.client ?? createSupabaseAdminClient();
  const raw = await rpcResult(
    "users.setStatus",
    admin.rpc("setAppUserStatus", { userId: targetId, isActive, actorUserId: options.actor.id }),
    { notFoundMessage: "User not found." },
  );
  const { changed, revokedSessions } = rpcResultSchema.parse(raw);
  return { userId: targetId, isActive, changed, revokedSessions };
}
