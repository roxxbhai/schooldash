import { z } from 'zod';
import { SETUP_CODE_INPUT_SCHEMA } from '@/constants/account-setup';
import { NEW_PASSWORD_SCHEMA } from '@/constants/sign-in';
import { completeAccountSetup } from '@/functions/account-setup';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { emailSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

// STRICT: UNKNOWN FIELDS SUCH AS `role` OR `userId` ARE REJECTED, NOT IGNORED.
const accountSetupSchema = z.strictObject({ email: emailSchema, code: SETUP_CODE_INPUT_SCHEMA, password: NEW_PASSWORD_SCHEMA });

/**
 * PUBLIC. AN ADMINISTRATOR ADDED BY ANOTHER ADMIN CHOOSES THEIR PASSWORD (OR
 * RESETS IT): EMAIL + THE ONE-TIME SETUP CODE THAT ADMIN WAS SHOWN + A NEW
 * PASSWORD. ON SUCCESS THEY ARE SIGNED IN. THIS IS NOT A SIGN-UP: IT NEVER
 * CREATES ACCOUNTS, AND ONLY ADMIN ACCOUNTS HAVE CODES.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const input = await parseJsonBody(request, accountSetupSchema);
  const supabase = await createSupabaseServerClient();
  return ok(unwrapResult(await completeAccountSetup(supabase, input)));
});
