import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from '@/configs';
import type { Database } from '@/types/database';

/**
 * CREATES A SUPABASE CLIENT BOUND TO THE CURRENT REQUEST'S AUTH COOKIES.
 *
 * USES THE PUBLISHABLE KEY, SO EVERY QUERY RUNS AS THE SIGNED-IN USER AND IS SUBJECT
 * TO ROW LEVEL SECURITY. CREATE A NEW CLIENT PER REQUEST — NEVER SHARE ONE.
 *
 * THROWS `EnvValidationError` BEFORE TOUCHING COOKIES OR SUPABASE IF THE
 * PROJECT IS NOT CONFIGURED.
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
            // SERVER COMPONENTS CANNOT SET COOKIES. AUTH STATE CHANGES HAPPEN
            // IN ROUTE HANDLERS, WHERE WRITES ARE ALLOWED; SEE docs/auth-and-api.md.
          }
        },
      },
    },
  );
}

/** SUPABASE SSR SESSION COOKIES: `sb-<ref>-auth-token`, ITS `.N` CHUNKS, AND THE PKCE VERIFIER. */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

/**
 * DELETES EVERY SUPABASE AUTH COOKIE ON THE CURRENT REQUEST. A FALLBACK FOR
 * LOGOUT WHEN SUPABASE CANNOT BE REACHED; NORMAL SIGN-OUT CLEARS COOKIES VIA
 * `setAll`. ONLY VALID WHERE COOKIES ARE WRITABLE (ROUTE HANDLERS, SERVER
 * FUNCTIONS).
 */
export async function clearSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (SUPABASE_AUTH_COOKIE.test(name)) cookieStore.delete(name);
  }
}
