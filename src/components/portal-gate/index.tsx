import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PortalSessionSync } from '@/components/portal-session-sync';
import { PortalShell } from '@/components/portal-shell';
import { PortalUnavailable } from '@/components/portal-unavailable';
import { ERROR_MESSAGES } from '@/constants/api-client';
import { ROLE_HOME_PATHS, ROLE_SIGN_IN_PATHS, SIGN_IN_REASONS } from '@/constants/routes';
import { findStudentIdByUserId, findTeacherIdByUserId } from '@/functions/authorization';
import { getCurrentAppUser, toSessionProfile } from '@/functions/session';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { FunctionResult } from '@/types/function-result';
import type { PortalRole } from '@/types/portal-shell';
import type { DbClient } from '@/types/supabase';

/** THE PERSON'S OWN TEACHER OR STUDENT RECORD, FROM THE SESSION'S USER ID. ADMINS HAVE NONE. */
async function findOwnRecordId(role: PortalRole, client: DbClient, userId: string): Promise<FunctionResult<string | null>> {
  switch (role) {
    case 'TEACHER':
      return findTeacherIdByUserId(client, userId);
    case 'STUDENT':
      return findStudentIdByUserId(client, userId);
    default:
      return { success: true, message: 'Operation successful', data: null };
  }
}

interface PortalGateProps {
  role: PortalRole;
  children: React.ReactNode;
}

/**
 * SERVER-SIDE GATE FOR EVERY PAGE OF A PORTAL (/admin, /teacher, /student). THE
 * ROLE COMES FROM THE DATABASE `users` ROW (VIA getUser()), AND A TEACHER'S OR
 * STUDENT'S OWN RECORD FROM THE SESSION'S USER ID, NEVER FROM THE BROWSER.
 * NOTHING INSIDE THE PORTAL RENDERS UNTIL THE ROLE IS CONFIRMED; ANOTHER ROLE IS
 * SENT TO ITS OWN HOME PAGE.
 *
 * THIS DECIDES WHICH PAGES RENDER; IT IS NOT THE SECURITY BOUNDARY FOR DATA.
 * EVERY API ROUTE STILL ENFORCES ITS OWN PERMISSIONS, AND RLS BACKS THEM UP.
 */
export async function PortalGate({ role, children }: PortalGateProps) {
  // REQUEST TIME ONLY: THE SUPABASE CLIENT READS THE CLOCK AND COOKIES, WHICH MUST NEVER BE PRERENDERED.
  await connection();
  const supabase = await createSupabaseServerClient();
  const result = await getCurrentAppUser(supabase);
  const signInPath = ROLE_SIGN_IN_PATHS[role];

  if (!result.success) {
    switch (result.data.code) {
      case 'UNAUTHORIZED':
        redirect(signInPath);
      case 'ACCOUNT_INACTIVE':
        redirect(`${signInPath}?reason=${SIGN_IN_REASONS.inactive}`);
      case 'ACCOUNT_NOT_PROVISIONED':
        redirect(`${signInPath}?reason=${SIGN_IN_REASONS.notProvisioned}`);
      default:
        return <PortalUnavailable message={ERROR_MESSAGES.SERVICE_UNAVAILABLE ?? result.message} />;
    }
  }

  if (result.data.role !== role) redirect(ROLE_HOME_PATHS[result.data.role]);

  const record = await findOwnRecordId(role, supabase, result.data.id);
  if (!record.success) return <PortalUnavailable message={ERROR_MESSAGES.SERVICE_UNAVAILABLE ?? record.message} />;
  // A TEACHER OR STUDENT ACCOUNT WITHOUT ITS RECORD CANNOT HAPPEN THROUGH PROVISIONING; TREAT IT LIKE AN UNPROVISIONED ACCOUNT.
  if (role !== 'ADMIN' && !record.data) redirect(`${signInPath}?reason=${SIGN_IN_REASONS.notProvisioned}`);

  return (
    <PortalShell role={role} profile={toSessionProfile(result.data)}>
      <PortalSessionSync recordId={record.data} />
      {children}
    </PortalShell>
  );
}
