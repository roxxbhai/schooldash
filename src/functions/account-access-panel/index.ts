import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { runRecordAction } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AccountStatusChange } from '@/types/account-status';
import type { ApiResult } from '@/types/api-client';
import type { TeacherSignUpReset } from '@/types/sign-in';

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

/** LETS A TEACHER SIGN UP AGAIN: THEIR OLD PASSWORD STOPS WORKING AND THEIR SESSIONS END. 409 FOR A DEACTIVATED ACCOUNT. */
export async function resetTeacherSignUp(userId: string): Promise<ApiResult<TeacherSignUpReset>> {
  try {
    return await runRecordAction<TeacherSignUpReset>(API_PATHS.users, userId, 'reset-sign-up');
  } catch {
    return networkFailure();
  }
}
