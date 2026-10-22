import { z } from 'zod';
import { ADMIN_COLUMNS, ADMIN_ERRORS } from '@/constants/admins';
import { issueSetupCode } from '@/functions/account-setup';
import { requireAdmin } from '@/functions/authorization';
import { provisionAccount } from '@/functions/provisioning';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody } from '@/helpers/request-validation';
import { emailSchema, fullNameSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { AdminAccount } from '@/types/admins';

/**
 * ADMINISTRATORS. THERE IS NO ADMIN SIGN-UP: THE FIRST ADMIN IS CREATED WITH
 * scripts/bootstrap-admin.ts AND EVERY LATER ONE BY AN EXISTING ADMIN HERE.
 * DEACTIVATION USES /api/users/{id}/deactivate (NEVER YOURSELF OR THE LAST ADMIN).
 */

const createAdminSchema = z.strictObject({ email: emailSchema, fullName: fullNameSchema });

/** ADMIN ONLY. EVERY ADMINISTRATOR, ACTIVE FIRST, THEN BY NAME. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const pagination = getPagination(new URL(request.url).searchParams);
  const rows = supabase
    .from('users')
    .select(ADMIN_COLUMNS, { count: 'exact' })
    .eq('role', 'admin')
    .order('isActive', { ascending: false })
    .order('fullName')
    .range(pagination.from, pagination.to);
  return paginated(await page<AdminAccount>('admins.list', rows, pagination, ADMIN_ERRORS));
});

/**
 * ADMIN ONLY. CREATES ANOTHER ADMINISTRATOR WITHOUT A PASSWORD AND RETURNS A
 * ONE-TIME SETUP CODE (SHOWN ONCE) WITH WHICH THEY CHOOSE ONE.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireAdmin(supabase));
  const { email, fullName } = await parseJsonBody(request, createAdminSchema);
  const account = unwrapResult(await provisionAccount({ role: 'ADMIN', email, fullName }, { actorUserId: actor.id }));
  const admin = await one<AdminAccount>('admins.get', supabase.from('users').select(ADMIN_COLUMNS).eq('id', account.userId).maybeSingle(), ADMIN_ERRORS);
  // THE ACCOUNT ALREADY EXISTS, SO A FAILED ISSUE RETURNS `setupCode: null`; A CODE CAN BE ISSUED LATER.
  const issued = await issueSetupCode(account.userId, { actor });
  return created({ ...admin, setupCode: issued.success ? issued.data : null });
});
