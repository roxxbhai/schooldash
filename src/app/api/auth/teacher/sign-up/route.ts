import { TEACHER_SIGN_UP_SCHEMA } from '@/constants/sign-in';
import { signUpTeacher } from '@/functions/sign-in';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * PUBLIC. A TEACHER'S ONE-TIME SIGN-UP: THE PHONE NUMBER THE SCHOOL REGISTERED + A
 * NEW PASSWORD; ON SUCCESS THEY ARE SIGNED IN. NEVER CREATES ACCOUNTS: ONLY AN
 * ACTIVE TEACHER AN ADMIN ADDED, WHO HAS NOT SIGNED UP YET, CAN USE IT.
 * 404 UNKNOWN NUMBER · 403 DEACTIVATED · 409 ALREADY SIGNED UP · 422 WEAK PASSWORD.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, TEACHER_SIGN_UP_SCHEMA);
  const supabase = await createSupabaseServerClient();
  return ok(unwrapResult(await signUpTeacher(supabase, credentials)));
});
