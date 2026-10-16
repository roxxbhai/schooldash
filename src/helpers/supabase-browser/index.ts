import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * SUPABASE CLIENT FOR CLIENT COMPONENTS.
 *
 * USES ONLY THE PUBLISHABLE KEY: EVERY REQUEST RUNS AS THE SIGNED-IN USER AND
 * IS LIMITED BY ROW LEVEL SECURITY. NEVER IMPORT THE ADMIN CLIENT OR THE
 * SECRET KEY INTO BROWSER CODE.
 *
 * THE `process.env.NEXT_PUBLIC_*` READS MUST STAY LITERAL SO Next.js CAN
 * INLINE THEM AT BUILD TIME.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return createBrowserClient<Database>(url, publishableKey);
}
