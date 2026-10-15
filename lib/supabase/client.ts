import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Client Components.
 *
 * Uses only the publishable key: every request runs as the signed-in user and
 * is limited by Row Level Security. Never import the admin client or the
 * secret key into browser code.
 *
 * The `process.env.NEXT_PUBLIC_*` reads must stay literal so Next.js can
 * inline them at build time.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createBrowserClient<Database>(url, publishableKey);
}
