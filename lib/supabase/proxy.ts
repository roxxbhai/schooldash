import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

/** Supabase SSR session cookies: `sb-<ref>-auth-token` and its `.N` chunks. */
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

/**
 * Refreshes the Supabase session before the request reaches a page or Route
 * Handler, so Server Components (which cannot write cookies) always see a
 * valid access token.
 *
 * - Requests without an auth cookie pass straight through (no network call).
 * - If Supabase is not configured, requests pass straight through.
 * - This does not authorize anything. Pages and Route Handlers must still
 *   verify the user themselves (lib/auth/authorization.ts).
 *
 * Deliberately not `server-only`: it runs in the proxy, and it reads the
 * public env vars directly instead of importing lib/env.ts.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return response;
  if (!request.cookies.getAll().some(({ name }) => AUTH_COOKIE.test(name))) return response;

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Make refreshed tokens visible to the rest of this request…
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        // …and send them to the browser, with the no-cache headers Supabase
        // requires so a CDN never serves one user's session to another.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and getClaims: getClaims
  // validates the access token and refreshes it if it has expired.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Network failure: leave the session as-is; handlers will re-validate.
  }

  return response;
}
