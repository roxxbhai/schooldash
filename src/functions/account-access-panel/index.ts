import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { runRecordAction } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { IssuedSetupCode } from '@/types/account-setup';
import type { AccountStatusChange } from '@/types/account-status';
import type { ApiResult } from '@/types/api-client';

/** `userId` IS `users.id` (THE RECORD'S `userId`), NOT THE TEACHER OR STUDENT ID. */

/** BLOCKS SIGN-IN AND ENDS EVERY SESSION AT ONCE. ALL HISTORY IS KEPT. */
export async function deactivateAccount(userId: string): Promise<ApiResult<AccountStatusChange>> {
  try {
    return await runRecordAction<AccountStatusChange>(API_PATHS.users, userId, 'deactivate');
  } catch {
    return networkFailure();
  }
}

export async function reactivateAccount(userId: string): Promise<ApiResult<AccountStatusChange>> {
  try {
    return await runRecordAction<AccountStatusChange>(API_PATHS.users, userId, 'reactivate');
  } catch {
    return networkFailure();
  }
}

/** A NEW ONE-TIME CODE, REPLACING ANY EARLIER ONE. 409 FOR A DEACTIVATED ACCOUNT, 403 FOR AN ADMIN. */
export async function issueAccountSetupCode(userId: string): Promise<ApiResult<IssuedSetupCode>> {
  try {
    return await runRecordAction<IssuedSetupCode>(API_PATHS.users, userId, 'setup-code');
  } catch {
    return networkFailure();
  }
}
