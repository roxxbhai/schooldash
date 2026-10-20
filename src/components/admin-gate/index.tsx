import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AdminShell } from '@/components/admin-shell';
import { PortalUnavailable } from '@/components/portal-unavailable';
import { ERROR_MESSAGES } from '@/constants/api-client';
import { ROUTES, SIGN_IN_REASONS } from '@/constants/routes';
import { getCurrentAppUser, toSessionProfile } from '@/functions/session';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * SERVER-SIDE GATE FOR EVERY /admin PAGE. THE ROLE COMES FROM THE DATABASE
 * `users` ROW (VIA getUser()), NEVER FROM THE BROWSER. NOTHING INSIDE THE
 * PORTAL RENDERS UNTIL AN ACTIVE ADMIN IS CONFIRMED.
 *
 * THIS DECIDES WHICH PAGES RENDER; IT IS NOT THE SECURITY BOUNDARY FOR DATA.
 * EVERY API ROUTE STILL ENFORCES ITS OWN PERMISSIONS, AND RLS BACKS THEM UP.
 */
export async function AdminGate({ children }: { children: React.ReactNode }) {
  // REQUEST TIME ONLY: THE SUPABASE CLIENT READS THE CLOCK AND COOKIES, WHICH MUST NEVER BE PRERENDERED.
  await connection();
  const supabase = await createSupabaseServerClient();
  const result = await getCurrentAppUser(supabase);

  if (!result.success) {
    switch (result.data.code) {
      case 'UNAUTHORIZED':
        redirect(ROUTES.signIn);
      case 'ACCOUNT_INACTIVE':
        redirect(`${ROUTES.signIn}?reason=${SIGN_IN_REASONS.inactive}`);
      case 'ACCOUNT_NOT_PROVISIONED':
        redirect(`${ROUTES.signIn}?reason=${SIGN_IN_REASONS.notProvisioned}`);
      default:
        return <PortalUnavailable message={ERROR_MESSAGES.SERVICE_UNAVAILABLE ?? result.message} />;
    }
  }

  if (result.data.role !== 'ADMIN') redirect(ROUTES.accessDenied);

  return <AdminShell profile={toSessionProfile(result.data)}>{children}</AdminShell>;
}
