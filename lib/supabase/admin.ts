import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Creates a Supabase client authenticated with the service-role key.
 *
 * This client BYPASSES Row Level Security (it authenticates with the
 * SUPABASE_SECRET_KEY). Its only sanctioned use today is account provisioning
 * in lib/auth/provisioning.ts — see docs/supabase.md. Use it only for trusted
 * server-side operations
 * after the caller's authorization has been checked in application code.
 * Never import it from Client Components or return its results unfiltered.
 *
 * Throws `EnvValidationError` before creating a client if the project is not
 * configured.
 */
export function createSupabaseAdminClient() {
  const env = getSupabaseAdminEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
