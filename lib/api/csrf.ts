import "server-only";
import { csrfRejected } from "@/lib/api/errors";

/**
 * CSRF protection for cookie-authenticated, state-changing Route Handlers.
 *
 * Next.js applies an Origin check to Server Actions automatically, but not to
 * Route Handlers, so every POST/PUT/PATCH/DELETE handler must call this.
 *
 * - If `Origin` is present it must match the host the request was sent to.
 * - Otherwise `Sec-Fetch-Site` must be `same-origin` or `none` (user-initiated).
 * - If neither header is present the request is rejected: every current
 *   browser sends at least one of them on POST, and non-browser clients can
 *   send `Origin` explicitly.
 *
 * This complements, not replaces, the SameSite=Lax default on Supabase auth
 * cookies and the application/json requirement on request bodies.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");

  if (origin !== null) {
    if (!allowedHosts(request).has(hostOf(origin) ?? "")) throw csrfRejected();
    return;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return;

  throw csrfRejected();
}

function allowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const urlHost = hostOf(request.url);
  if (urlHost) hosts.add(urlHost);

  const host = request.headers.get("host");
  if (host) hosts.add(host.trim().toLowerCase());

  // Set by the hosting platform's proxy (e.g. Vercel); first entry is the client-facing host.
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) hosts.add(forwarded.toLowerCase());

  return hosts;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null; // includes the literal "null" origin from sandboxed/opaque contexts
  }
}
