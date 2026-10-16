import 'server-only';
import { z } from 'zod';
import { forbidden } from '@/helpers/api-error';
import { rpcResult } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import { assertUuid } from '@/helpers/request-validation';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import type { AccountStatusChange } from '@/types/account-status';
import type { AppUser } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/**
 * TRUSTED, SERVER-ONLY ACCOUNT DEACTIVATION AND REACTIVATION.
 *
 * STATUS IS CHANGED BY `public."setAppUserStatus"` IN ONE TRANSACTION: THE
 * USERS ROW ("isActive" + "deactivatedAt"), DELETION OF THE USER'S SUPABASE
 * AUTH SESSIONS (ON DEACTIVATION), AND THE AUDIT ENTRY. ONLY THE
 * SECRET-KEY CLIENT MAY CALL IT; CALLERS MUST PASS THE ADMIN PERFORMING THE
 * CHANGE, OBTAINED FROM `requireAdmin()`.
 *
 * EFFECT ON A DEACTIVATED USER WHO IS SIGNED IN:
 *   - THEIR REFRESH TOKENS ARE REVOKED IMMEDIATELY (SESSIONS DELETED);
 *   - EVERY API REQUEST IS REJECTED: `getUser()` FAILS FOR A DELETED SESSION
 *     (401) AND `isActive = false` IS CHECKED ON EVERY REQUEST (403);
 *   - RLS DENIES ALL SCHOOL DATA TO INACTIVE USERS AT THE DATABASE LEVEL;
 *   - AN ACCESS TOKEN ALREADY ISSUED STAYS CRYPTOGRAPHICALLY VALID UNTIL IT
 *     EXPIRES (≤ 1 H BY DEFAULT), BUT IT CAN ONLY READ THE USER'S OWN `users`
 *     ROW THROUGH THE DATA API.
 *
 * HISTORY (student/teacher PROFILES, ENROLLMENTS, ATTENDANCE, RESULTS, AUDIT
 * LOGS) IS NEVER MODIFIED.
 */

const statusChangeSchema = z.object({ changed: z.boolean(), revokedSessions: z.number().int() });

export async function setAccountStatus(
  userId: string,
  isActive: boolean,
  options: { actor: AppUser; client?: DbClient },
): Promise<FunctionResult<AccountStatusChange>> {
  try {
    // DEFENSE IN DEPTH: THE ROUTE ALREADY RAN requireAdmin().
    if (options.actor.role !== 'ADMIN' || !options.actor.isActive) throw forbidden();
    const targetId = assertUuid(userId, 'id');

    const admin = options.client ?? createSupabaseAdminClient();
    const rpcData = await rpcResult(
      'users.setStatus',
      admin.rpc('setAppUserStatus', { userId: targetId, isActive, actorUserId: options.actor.id }),
      { notFoundMessage: 'User not found.' },
    );
    const { changed, revokedSessions } = statusChangeSchema.parse(rpcData);
    return functionSuccess({ userId: targetId, isActive, changed, revokedSessions });
  } catch (error) {
    return functionFailure(error, 'users.setStatus');
  }
}
