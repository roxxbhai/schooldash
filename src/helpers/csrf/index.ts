import 'server-only';
import { csrfRejected } from '@/helpers/api-error';

/**
 * CSRF PROTECTION FOR COOKIE-AUTHENTICATED, STATE-CHANGING ROUTE HANDLERS.
 *
 * Next.js APPLIES AN ORIGIN CHECK TO SERVER ACTIONS AUTOMATICALLY, BUT NOT TO
 * ROUTE HANDLERS, SO EVERY POST/PUT/PATCH/DELETE HANDLER MUST CALL THIS.
 *
 * - IF `Origin` IS PRESENT IT MUST MATCH THE HOST THE REQUEST WAS SENT TO.
 * - OTHERWISE `Sec-Fetch-Site` MUST BE `same-origin` OR `none` (USER-INITIATED).
 * - IF NEITHER HEADER IS PRESENT THE REQUEST IS REJECTED: EVERY CURRENT
 *   BROWSER SENDS AT LEAST ONE OF THEM ON POST, AND NON-BROWSER CLIENTS CAN
 *   SEND `Origin` EXPLICITLY.
 *
 * THIS COMPLEMENTS, NOT REPLACES, THE SameSite=LAX DEFAULT ON SUPABASE AUTH
 * COOKIES AND THE application/json REQUIREMENT ON REQUEST BODIES.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');

  if (origin !== null) {
    if (!allowedHosts(request).has(hostOf(origin) ?? '')) throw csrfRejected();
    return;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchSite === 'none') return;

  throw csrfRejected();
}

function allowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const urlHost = hostOf(request.url);
  if (urlHost) hosts.add(urlHost);

  const host = request.headers.get('host');
  if (host) hosts.add(host.trim().toLowerCase());

  // SET BY THE HOSTING PLATFORM'S PROXY (E.G. VERCEL); FIRST ENTRY IS THE CLIENT-FACING HOST.
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwarded) hosts.add(forwarded.toLowerCase());

  return hosts;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null; // INCLUDES THE LITERAL "NULL" ORIGIN FROM sandboxed/opaque CONTEXTS
  }
}
