export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * API RESPONSES CAN CARRY PER-USER DATA AND SUPABASE AUTH COOKIES, SO BROWSERS,
 * CDNS AND PROXIES MUST NEVER STORE THEM. THESE MATCH THE HEADERS
 * @supabase/ssr REQUIRES ON RESPONSES THAT SET AUTH COOKIES.
 */
export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
} as const;

/** CLIENT-SAFE MESSAGES FOR FAILURES THAT ARE NOT THE CALLER'S FAULT. */
export const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';
export const SERVICE_UNAVAILABLE_MESSAGE = 'A required service is temporarily unavailable.';
