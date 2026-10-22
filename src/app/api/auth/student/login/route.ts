import { STUDENT_SIGN_IN_SCHEMA } from '@/constants/sign-in';
import { toSessionProfile } from '@/functions/session';
import { signInStudent } from '@/functions/sign-in';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * STUDENT SIGN-IN: ADMISSION NUMBER ONLY, NO PASSWORD. SETS THE SESSION COOKIES
 * ON SUCCESS. 401 FOR AN UNKNOWN NUMBER, 403 FOR A DEACTIVATED STUDENT.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, STUDENT_SIGN_IN_SCHEMA);
  const supabase = await createSupabaseServerClient();
  return ok(toSessionProfile(unwrapResult(await signInStudent(supabase, credentials))));
});
