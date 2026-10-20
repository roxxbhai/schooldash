import type { SessionProfile } from '@/types/auth';

/** A NEWLY ISSUED CODE. THE PLAIN CODE IS RETURNED ONCE AND NEVER STORED. */
export interface IssuedSetupCode {
  /** FORMATTED FOR READING ALOUD OR PRINTING, E.G. "7K2M-Q9TB-4HXD". */
  code: string;
  expiresAt: string;
}

export interface AccountSetupInput {
  email: string;
  code: string;
  password: string;
}

/** SIGNED IN AFTER SETTING THE PASSWORD; `isSignedIn` IS FALSE ONLY IF THAT LAST STEP FAILED. */
export interface AccountSetupOutcome {
  isSignedIn: boolean;
  profile: SessionProfile | null;
}
