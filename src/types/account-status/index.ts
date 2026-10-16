/** THE OUTCOME OF A DEACTIVATION OR REACTIVATION. RETURNED BY THE API AS IS. */
export interface AccountStatusChange {
  userId: string;
  isActive: boolean;
  /** FALSE WHEN THE ACCOUNT WAS ALREADY IN THE REQUESTED STATE (NO AUDIT ENTRY). */
  changed: boolean;
  /** AUTH SESSIONS REVOKED BY A DEACTIVATION. */
  revokedSessions: number;
}
