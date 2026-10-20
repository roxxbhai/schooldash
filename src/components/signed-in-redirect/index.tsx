import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ROLE_HOME_PATHS } from '@/constants/routes';
import { getCurrentAppUser } from '@/functions/session';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * SERVER COMPONENT FOR THE PUBLIC AUTH PAGES: SOMEONE ALREADY SIGNED IN IS SENT
 * TO THEIR HOME PAGE INSTEAD OF SEEING THE FORM AGAIN. RENDERS NOTHING.
 * ANY FAILURE (NO SESSION, INACTIVE, SUPABASE DOWN) SIMPLY LEAVES THE FORM IN PLACE.
 */
export async function SignedInRedirect() {
  // REQUEST TIME ONLY: THE SUPABASE CLIENT READS THE CLOCK AND COOKIES, WHICH MUST NEVER BE PRERENDERED.
  await connection();
  const supabase = await createSupabaseServerClient();
  const result = await getCurrentAppUser(supabase);
  if (result.success) redirect(ROLE_HOME_PATHS[result.data.role]);
  return null;
}
