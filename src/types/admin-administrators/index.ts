import type { AdminAccount } from '@/types/admins';

/** THE ROW ACTION WAITING FOR CONFIRMATION: A NEW SETUP CODE, OR A STATUS CHANGE. */
export interface PendingAdministratorAction {
  kind: 'setupCode' | 'status';
  administrator: AdminAccount;
}
