import { z } from 'zod';
import { SIGN_IN_REASONS } from '@/constants/routes';

/**
 * CLIENT-SIDE CHECKS FOR THE SIGN-IN AND SETUP FORMS. THEY ONLY CATCH OBVIOUS
 * MISTAKES EARLY; THE SERVER VALIDATES EVERYTHING AGAIN.
 */

const emailField = z
  .string()
  .trim()
  .min(1, { error: 'Enter your email address.' })
  .pipe(z.email({ error: 'Enter a valid email address, like name@example.com.' }));

export const SIGN_IN_FORM_SCHEMA = z.object({
  email: emailField,
  password: z.string().min(1, { error: 'Enter your password.' }),
});

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 72;

export const ACCOUNT_SETUP_FORM_SCHEMA = z
  .object({
    email: emailField,
    code: z
      .string()
      .trim()
      .min(1, { error: 'Enter the setup code you were given.' })
      .regex(/^[0-9A-Za-z\s-]{12,20}$/, { error: 'Setup codes have 12 letters and numbers, like 7K2M-Q9TB-4HXD.' }),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` })
      .max(MAX_PASSWORD_LENGTH, { error: `Use at most ${MAX_PASSWORD_LENGTH} characters.` }),
    confirmPassword: z.string().min(1, { error: 'Enter the password again.' }),
  })
  .refine((form) => form.password === form.confirmPassword, { path: ['confirmPassword'], error: 'The passwords do not match.' });

/** A SHORT HEADLINE ABOVE EACH SIGN-IN OR SETUP FAILURE; THE MESSAGE BELOW IT SAYS WHAT TO DO. */
export const AUTH_ERROR_TITLES: Record<string, string> = {
  INVALID_CREDENTIALS: "Couldn't sign you in",
  INVALID_SETUP_CODE: "Couldn't verify the setup code",
  ACCOUNT_INACTIVE: 'Account deactivated',
  ACCOUNT_NOT_PROVISIONED: 'Account not set up',
  RATE_LIMITED: 'Too many attempts',
  NETWORK_ERROR: 'No connection',
  SERVICE_UNAVAILABLE: 'Portal unavailable',
  VALIDATION_ERROR: 'Check your details',
};

export const DEFAULT_AUTH_ERROR_TITLE = 'Something went wrong';

/** NOTICES SHOWN ABOVE THE SIGN-IN FORM, KEYED BY THE ?reason= THE PORTAL REDIRECTED WITH. */
export const SIGN_IN_NOTICES: Record<string, { tone: 'info' | 'success' | 'error'; message: string }> = {
  [SIGN_IN_REASONS.sessionExpired]: { tone: 'info', message: 'Your session ended. Please sign in again to continue.' },
  [SIGN_IN_REASONS.signedOut]: { tone: 'success', message: 'You have signed out.' },
  [SIGN_IN_REASONS.passwordSet]: { tone: 'success', message: 'Your password is set. Sign in with your email and new password.' },
  [SIGN_IN_REASONS.inactive]: { tone: 'error', message: 'This account has been deactivated. Please contact the school office.' },
  [SIGN_IN_REASONS.notProvisioned]: { tone: 'error', message: "This account isn't set up for the school portal yet. Please contact the school office." },
};
