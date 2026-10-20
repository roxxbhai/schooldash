import { z } from 'zod';
import { SETUP_CODE_INPUT_SCHEMA } from '@/constants/account-setup';
import { completeAccountSetup } from '@/functions/account-setup';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { emailSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

// STRICT: UNKNOWN FIELDS SUCH AS `role` OR `userId` ARE REJECTED, NOT IGNORED.
const accountSetupSchema = z.strictObject({
  email: emailSchema,
  code: SETUP_CODE_INPUT_SCHEMA,
  password: z
    .string({ error: 'Password is required.' })
    .min(12, { error: 'Use at least 12 characters.' })
    .max(72, { error: 'Use at most 72 characters.' }),
});

/**
 * PUBLIC. FIRST-TIME ACCOUNT SETUP (OR AN ADMIN-ISSUED RESET): EMAIL + ONE-TIME
 * SETUP CODE + NEW PASSWORD. ON SUCCESS THE PERSON IS SIGNED IN.
 * NEVER CREATES ACCOUNTS OR ASSIGNS ROLES; ONLY ACCOUNTS AN ADMIN PROVISIONED HAVE CODES.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const input = await parseJsonBody(request, accountSetupSchema);
  const supabase = await createSupabaseServerClient();
  return ok(unwrapResult(await completeAccountSetup(supabase, input)));
});
