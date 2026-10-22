import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, runRecordAction } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AdministratorForm } from '@/constants/admin-administrators';
import type { IssuedSetupCode } from '@/types/account-setup';
import type { CreatedAdmin } from '@/types/admins';
import type { ApiResult } from '@/types/api-client';

/** CREATES ANOTHER ADMINISTRATOR WITHOUT A PASSWORD; THE SERVER RETURNS THEIR ONE-TIME SETUP CODE. */
export async function createAdministrator(form: AdministratorForm): Promise<ApiResult<CreatedAdmin>> {
  try {
    return await createRecord<CreatedAdmin>(API_PATHS.admins, { fullName: form.fullName, email: form.email });
  } catch {
    return networkFailure();
  }
}

/** A NEW ONE-TIME CODE FOR AN ADMINISTRATOR (FIRST SETUP OR A FORGOTTEN PASSWORD), REPLACING ANY EARLIER ONE. */
export async function issueAdministratorSetupCode(userId: string): Promise<ApiResult<IssuedSetupCode>> {
  try {
    return await runRecordAction<IssuedSetupCode>(API_PATHS.users, userId, 'setup-code');
  } catch {
    return networkFailure();
  }
}
