import { TEACHER_SIGN_IN_SCHEMA } from '@/constants/sign-in';
import { toSessionProfile } from '@/functions/session';
import { signInTeacher } from '@/functions/sign-in';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * TEACHER SIGN-IN: PHONE NUMBER + PASSWORD. SETS THE SESSION COOKIES ON SUCCESS.
 * AN UNKNOWN NUMBER, A WRONG PASSWORD AND A NON-TEACHER ACCOUNT ARE ALL THE SAME 401.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, TEACHER_SIGN_IN_SCHEMA);
  const supabase = await createSupabaseServerClient();
  return ok(toSessionProfile(unwrapResult(await signInTeacher(supabase, credentials))));
});
