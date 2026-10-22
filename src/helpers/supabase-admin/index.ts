import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminEnv } from '@/configs';
import type { Database } from '@/types/database';

/**
 * CREATES A SUPABASE CLIENT AUTHENTICATED WITH THE SERVICE-ROLE KEY.
 *
 * THIS CLIENT BYPASSES ROW LEVEL SECURITY (IT AUTHENTICATES WITH THE
 * SUPABASE_SECRET_KEY). ITS ONLY SANCTIONED USES ARE THE SERVICES IN
 * functions/provisioning, account-status, account-setup AND sign-in — SEE
 * docs/supabase.md. USE IT ONLY FOR TRUSTED SERVER-SIDE OPERATIONS, AFTER THE
 * CALLER'S AUTHORIZATION HAS BEEN CHECKED IN APPLICATION CODE (OR, FOR SIGN-IN,
 * ONLY TO LOOK UP THE IDENTITY BEHIND A PHONE OR ADMISSION NUMBER).
 * NEVER IMPORT IT FROM CLIENT COMPONENTS OR RETURN ITS RESULTS UNFILTERED.
 *
 * THROWS `EnvValidationError` BEFORE CREATING A CLIENT IF THE PROJECT IS NOT
 * CONFIGURED.
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
