import type { ZodError } from 'zod';
import type { ApiResult } from '@/types/api-client';

/** THE ONE MESSAGE ABOVE A FAILED AUTH FORM. `code` LETS A FORM ADD A NEXT STEP (E.G. A SIGN-UP LINK). */
export interface AuthFormError {
  code: string;
  title: string;
  message: string;
}

export interface AuthFormOptions<Values, Parsed, Outcome> {
  /**
   * PREFIXES THE FIELD IDS. NEXT.JS KEEPS THE PREVIOUS PAGE IN THE DOCUMENT (HIDDEN) AFTER A
   * CLIENT NAVIGATION, SO TWO AUTH FORMS (E.G. TEACHER SIGN-IN AND SIGN-UP) MUST NEVER SHARE AN ID.
   */
  formId: string;
  initialValues: Values;
  /** CLIENT CHECKS; THE SERVER VALIDATES EVERYTHING AGAIN. */
  schema: { safeParse: (values: Values) => { success: true; data: Parsed } | { success: false; error: ZodError } };
  submit: (parsed: Parsed) => Promise<ApiResult<Outcome>>;
  /** WHERE TO GO ONCE THE SERVER CONFIRMS. */
  destination: (outcome: Outcome) => string;
  /** A TOAST AFTER SUCCESS, IF ANY. */
  successMessage?: (outcome: Outcome) => string | null;
}
