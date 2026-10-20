import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AccountSetupInput, AccountSetupOutcome } from '@/types/account-setup';
import type { ApiResult } from '@/types/api-client';
import type { PasswordCredentials, SessionProfile } from '@/types/auth';

/**
 * BROWSER-SIDE AUTHENTICATION. THE SESSION LIVES ONLY IN THE HTTP-ONLY SUPABASE
 * COOKIES SET BY THE SERVER; NOTHING IS STORED IN THE BROWSER BY THIS CODE.
 */

export async function signIn(credentials: PasswordCredentials): Promise<ApiResult<SessionProfile>> {
  try {
    return await apiRequest<SessionProfile>(API_PATHS.auth.login, { method: 'POST', body: credentials, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

export async function signOut(): Promise<ApiResult<{ signedOut: boolean }>> {
  try {
    return await apiRequest<{ signedOut: boolean }>(API_PATHS.auth.logout, { method: 'POST', isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

export async function completeAccountSetup(input: AccountSetupInput): Promise<ApiResult<AccountSetupOutcome>> {
  try {
    return await apiRequest<AccountSetupOutcome>(API_PATHS.auth.setup, { method: 'POST', body: input, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}
