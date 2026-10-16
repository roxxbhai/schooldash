import type { AppRole } from '@/types/auth';
import type { DbClient } from '@/types/supabase';

export interface ProvisionOptions {
  /** `users.id` OF THE ADMIN PERFORMING THE ACTION; NULL FOR THE BOOTSTRAP CLI. */
  actorUserId?: string | null;
  /**
   * LINK AN AUTH USER THAT ALREADY EXISTS FOR THIS EMAIL INSTEAD OF FAILING.
   * USED BY THE INITIAL-ADMIN BOOTSTRAP AND FOR RECOVERING A PARTIAL FAILURE.
   */
  linkExistingAuthUser?: boolean;
  /** SECRET-KEY CLIENT; CREATED FROM ENV IF OMITTED. */
  client?: DbClient;
}

export interface ProvisionedAccount {
  userId: string;
  authUserId: string;
  role: AppRole;
  /** FALSE WHEN AN EXISTING AUTH USER WAS LINKED. */
  isAuthUserCreated: boolean;
}
