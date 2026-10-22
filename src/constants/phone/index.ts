import { z } from 'zod';
import { normalizePhone } from '@/helpers/phone';

export const PHONE_NUMBER_MESSAGE = 'Enter a 10-digit mobile number, like 98765 43210.';

/**
 * A TEACHER'S MOBILE NUMBER, NORMALIZED TO 10 DIGITS. THE SAME RULE ON THE SERVER
 * (STORAGE AND SIGN-IN LOOKUPS) AND IN THE BROWSER (FORMS).
 */
export const PHONE_NUMBER_SCHEMA = z
  .string({ error: 'Enter a mobile number.' })
  .trim()
  .min(1, { error: 'Enter a mobile number.' })
  .max(30, { error: PHONE_NUMBER_MESSAGE })
  .transform(function toPhoneNumber(value, context) {
    const phone = normalizePhone(value);
    if (phone) return phone;
    context.addIssue({ code: 'custom', message: PHONE_NUMBER_MESSAGE });
    return z.NEVER;
  });
