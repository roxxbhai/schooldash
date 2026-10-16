import { z } from 'zod';
import { signInWithPassword, toSessionProfile } from '@/functions/session';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

// STRICT: UNKNOWN FIELDS SUCH AS `role` OR `userId` ARE REJECTED, NOT IGNORED.
const loginSchema = z.strictObject({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  password: z
    .string({ error: 'Password is required.' })
    .min(1, { error: 'Password is required.' })
    .max(1024, { error: 'Password is too long.' }),
});

/**
 * EMAIL + PASSWORD SIGN-IN. SETS THE SUPABASE SESSION COOKIES ON SUCCESS.
 * DOES NOT REGISTER USERS, CREATE APPLICATION ACCOUNTS, OR ASSIGN ROLES.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, loginSchema);

  const supabase = await createSupabaseServerClient();
  const user = unwrapResult(await signInWithPassword(supabase, credentials));
  return ok(toSessionProfile(user));
});
