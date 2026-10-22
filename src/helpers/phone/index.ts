/**
 * INDIAN MOBILE NUMBERS. TEACHERS SIGN IN WITH THEIRS, SO EVERY COPY IS STORED
 * THE SAME WAY: 10 DIGITS, NO +91 OR 0 PREFIX. PURE: USED BY THE SERVER AND THE BROWSER.
 */

// THE DIGITS OF A MOBILE NUMBER WITH AN OPTIONAL 91 OR 0 PREFIX; GROUP 1 IS THE 10-DIGIT NUMBER.
const MOBILE_DIGITS = /^(?:91|0)?([6-9]\d{9})$/;

/** "+91 98765-43210", "098765 43210" AND "9876543210" ALL BECOME "9876543210". NULL IF IT IS NOT A MOBILE NUMBER. */
export function normalizePhone(value: string): string | null {
  return MOBILE_DIGITS.exec(value.replace(/\D/g, ''))?.[1] ?? null;
}

/** "9876543210" → "98765 43210", AS PEOPLE WRITE IT. ANYTHING ELSE IS SHOWN AS STORED. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const normalized = normalizePhone(phone);
  return normalized ? `${normalized.slice(0, 5)} ${normalized.slice(5)}` : phone;
}
