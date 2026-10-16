import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/** SUPABASE SSR SESSION COOKIES: `sb-<ref>-auth-token` AND ITS `.N` CHUNKS. */
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

/**
 * REFRESHES THE SUPABASE SESSION BEFORE THE REQUEST REACHES A PAGE OR ROUTE
 * HANDLER, SO SERVER COMPONENTS (WHICH CANNOT WRITE COOKIES) ALWAYS SEE A
 * VALID ACCESS TOKEN.
 *
 * - REQUESTS WITHOUT AN AUTH COOKIE PASS STRAIGHT THROUGH (NO NETWORK CALL).
 * - IF SUPABASE IS NOT CONFIGURED, REQUESTS PASS STRAIGHT THROUGH.
 * - THIS DOES NOT AUTHORIZE ANYTHING. PAGES AND ROUTE HANDLERS MUST STILL
 *   VERIFY THE USER THEMSELVES (lib/auth/authorization.ts).
 *
 * DELIBERATELY NOT `server-only`: IT RUNS IN THE PROXY, AND IT READS THE
 * PUBLIC ENV VARS DIRECTLY INSTEAD OF IMPORTING lib/env.ts.
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
        // MAKE REFRESHED TOKENS VISIBLE TO THE REST OF THIS REQUEST…
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        // …AND SEND THEM TO THE BROWSER, WITH THE NO-CACHE HEADERS SUPABASE
        // REQUIRES SO A CDN NEVER SERVES ONE USER'S SESSION TO ANOTHER.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // DO NOT RUN CODE BETWEEN createServerClient AND getClaims: getClaims
  // VALIDATES THE ACCESS TOKEN AND REFRESHES IT IF IT HAS EXPIRED.
  try {
    await supabase.auth.getClaims();
  } catch {
    // NETWORK FAILURE: LEAVE THE SESSION AS-IS; HANDLERS WILL RE-VALIDATE.
  }

  return response;
}
