import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Creates a Supabase client bound to the current request's auth cookies.
 *
 * Uses the publishable key, so every query runs as the signed-in user and is subject
 * to Row Level Security. Create a new client per request — never share one.
 *
 * Throws `EnvValidationError` before touching cookies or Supabase if the
 * project is not configured.
 */
export async function createSupabaseServerClient() {
  const env = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Auth state changes happen
            // in Route Handlers, where writes are allowed; see docs/auth-and-api.md.
          }
        },
      },
    },
  );
}

/** Supabase SSR session cookies: `sb-<ref>-auth-token`, its `.N` chunks, and the PKCE verifier. */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

/**
 * Deletes every Supabase auth cookie on the current request. A fallback for
 * logout when Supabase cannot be reached; normal sign-out clears cookies via
 * `setAll`. Only valid where cookies are writable (Route Handlers, Server
 * Functions).
 */
export async function clearSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (SUPABASE_AUTH_COOKIE.test(name)) cookieStore.delete(name);
  }
}
