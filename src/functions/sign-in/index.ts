import 'server-only';
import { randomBytes } from 'node:crypto';
import { isAuthApiError, isAuthRetryableFetchError, isAuthWeakPasswordError } from '@supabase/supabase-js';
import type { AuthError } from '@supabase/supabase-js';
import { z } from 'zod';
import { SIGN_IN_FAILURE_MESSAGES, TEACHER_ALREADY_SIGNED_UP_MESSAGE, TEACHER_NOT_FOUND_MESSAGE } from '@/constants/sign-in';
import { acceptNewSession, signInWithPassword, toSessionProfile } from '@/functions/session';
import { accountInactive, conflict, DataAccessError, forbidden, invalidCredentials, notFound, rateLimited, serviceUnavailable, validationError } from '@/helpers/api-error';
import { rpcResult } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import { logServerError } from '@/helpers/logger';
import { assertUuid } from '@/helpers/request-validation';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import type { AccountSetupOutcome } from '@/types/account-setup';
import type { AppUser, PasswordCredentials, StudentCredentials, TeacherCredentials } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { TeacherSignUpReset } from '@/types/sign-in';
import type { DbClient } from '@/types/supabase';

/**
 * ONE SIGN-IN PER ROLE (MIGRATION 15). EVERY FUNCTION STARTS THE SESSION ON
 * `client`, THE REQUEST-SCOPED CLIENT, SO ITS COOKIES ARE WRITTEN TO THE RESPONSE.
 *
 * SUPABASE AUTH IDENTIFIES EVERYONE BY EMAIL. TEACHERS AND STUDENTS NEVER TYPE
 * IT: THE SERVER LOOKS IT UP (SECRET-KEY CLIENT) FROM THE PHONE OR ADMISSION
 * NUMBER. A SIGN-IN FORM ONLY ACCEPTS ITS OWN ROLE; ANY OTHER ACCOUNT GETS THE
 * SAME 401 AS WRONG CREDENTIALS.
 *
 * STUDENTS HAVE NO PASSWORD. THE SERVER MINTS A ONE-TIME MAGIC-LINK TOKEN FOR
 * THE STUDENT'S IDENTITY AND REDEEMS IT AT ONCE; NO EMAIL IS SENT. ANYONE WHO
 * KNOWS AN ADMISSION NUMBER CAN SIGN IN AS THAT STUDENT, BY DESIGN.
 */

const teacherLookupSchema = z.object({ email: z.string() }).nullable();
const studentLookupSchema = z.array(z.object({ user: z.object({ authUserId: z.uuid(), email: z.string(), isActive: z.boolean() }) }));
const claimSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('claimed'), userId: z.uuid(), authUserId: z.uuid(), email: z.string() }),
  z.object({ status: z.literal('notFound') }),
  z.object({ status: z.literal('inactive') }),
  z.object({ status: z.literal('alreadySignedUp') }),
]);
const resetSchema = z.object({ authUserId: z.uuid(), revokedSessions: z.number().int() });

function isAuthServiceFailure(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500);
}

/** A FAILED AUTH ADMIN CALL AS A CLIENT-SAFE ERROR. */
function toAuthAdminError(error: AuthError, operation: string): Error {
  if (isAuthApiError(error) && error.status === 429) return rateLimited();
  if (isAuthServiceFailure(error)) {
    logServerError(operation, error);
    return serviceUnavailable();
  }
  return new DataAccessError(operation, error.code ?? 'UNKNOWN');
}

/** ADMINS: EMAIL + PASSWORD. */
export async function signInAdmin(client: DbClient, credentials: PasswordCredentials): Promise<FunctionResult<AppUser>> {
  try {
    return await signInWithPassword(client, credentials, { role: 'ADMIN', credentialMessage: SIGN_IN_FAILURE_MESSAGES.ADMIN });
  } catch (error) {
    return functionFailure(error, 'auth.signInAdmin');
  }
}

/** TEACHERS: PHONE NUMBER (ALREADY NORMALIZED) + PASSWORD. AN UNKNOWN NUMBER IS THE SAME 401 AS A WRONG PASSWORD. */
export async function signInTeacher(
  client: DbClient,
  credentials: TeacherCredentials,
  options: { adminClient?: DbClient } = {},
): Promise<FunctionResult<AppUser>> {
  try {
    const admin = options.adminClient ?? createSupabaseAdminClient();
    const teacher = teacherLookupSchema.parse(
      await rpcResult(
        'auth.findTeacherByPhone',
        admin.from('users').select('email').eq('role', 'teacher').eq('phone', credentials.phone).maybeSingle(),
      ),
    );
    if (!teacher) throw invalidCredentials(SIGN_IN_FAILURE_MESSAGES.TEACHER);
    return await signInWithPassword(
      client,
      { email: teacher.email, password: credentials.password },
      { role: 'TEACHER', credentialMessage: SIGN_IN_FAILURE_MESSAGES.TEACHER },
    );
  } catch (error) {
    return functionFailure(error, 'auth.signInTeacher');
  }
}

/**
 * A TEACHER'S ONE-TIME SIGN-UP: THE PHONE NUMBER AN ADMIN REGISTERED + A NEW
 * PASSWORD, THEN SIGNED IN. NO VERIFICATION CODE: ONLY ADMIN-CREATED, ACTIVE
 * TEACHERS WHO HAVE NOT SIGNED UP YET CAN DO THIS.
 *
 * THE SIGN-UP IS CLAIMED ATOMICALLY BEFORE THE PASSWORD IS SET, SO TWO
 * CONCURRENT REQUESTS CANNOT BOTH SUCCEED. IF SETTING THE PASSWORD FAILS, THE
 * CLAIM IS RELEASED SO THE TEACHER CAN TRY AGAIN.
 */
export async function signUpTeacher(
  client: DbClient,
  credentials: TeacherCredentials,
  options: { adminClient?: DbClient } = {},
): Promise<FunctionResult<AccountSetupOutcome>> {
  try {
    const admin = options.adminClient ?? createSupabaseAdminClient();
    const claim = claimSchema.parse(
      await rpcResult('auth.claimTeacherSignUp', admin.rpc('claimTeacherSignUp', { phone: credentials.phone })),
    );

    switch (claim.status) {
      case 'notFound':
        throw notFound(TEACHER_NOT_FOUND_MESSAGE);
      case 'inactive':
        throw accountInactive();
      case 'alreadySignedUp':
        throw conflict(TEACHER_ALREADY_SIGNED_UP_MESSAGE);
    }

    const { error } = await admin.auth.admin.updateUserById(claim.authUserId, { password: credentials.password });
    if (error) {
      await releaseSignUpClaim(admin, claim.userId);
      if (isAuthWeakPasswordError(error)) {
        throw validationError([{ path: 'password', message: 'This password is too easy to guess. Choose a longer one with a mix of words, numbers or symbols.' }]);
      }
      throw toAuthAdminError(error, 'auth.setTeacherPassword');
    }

    const signedIn = await signInWithPassword(client, { email: claim.email, password: credentials.password }, { role: 'TEACHER' });
    if (!signedIn.success) {
      logServerError('auth.teacherSignUpSignIn', new Error(signedIn.message));
      return functionSuccess({ isSignedIn: false, profile: null });
    }
    return functionSuccess({ isSignedIn: true, profile: toSessionProfile(signedIn.data) });
  } catch (error) {
    return functionFailure(error, 'auth.signUpTeacher');
  }
}

/** UNDOES A SIGN-UP CLAIM AFTER A FAILED PASSWORD UPDATE. BEST EFFORT: A FAILURE IS LOGGED, AND AN ADMIN CAN RESET THE SIGN-UP. */
async function releaseSignUpClaim(admin: DbClient, userId: string): Promise<void> {
  const { error } = await admin.from('users').update({ passwordSetAt: null }).eq('id', userId);
  if (error) logServerError('auth.releaseSignUpClaim', error);
}

/** STUDENTS: ADMISSION NUMBER ONLY (EXACT MATCH AFTER TRIMMING). */
export async function signInStudent(
  client: DbClient,
  credentials: StudentCredentials,
  options: { adminClient?: DbClient } = {},
): Promise<FunctionResult<AppUser>> {
  try {
    const admin = options.adminClient ?? createSupabaseAdminClient();
    const matches = studentLookupSchema.parse(
      await rpcResult(
        'auth.findStudentByAdmissionNumber',
        admin
          .from('students')
          .select('user:users!studentsUserFkey!inner(authUserId, email, isActive)')
          .eq('admissionNumber', credentials.admissionNumber)
          .limit(1),
      ),
    );
    const student = matches[0]?.user;
    if (!student) throw invalidCredentials(SIGN_IN_FAILURE_MESSAGES.STUDENT);
    if (!student.isActive) throw accountInactive();

    // A ONE-TIME TOKEN FOR THIS IDENTITY, REDEEMED STRAIGHT AWAY ON THE REQUEST CLIENT. NO EMAIL IS SENT.
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: student.email });
    if (link.error) throw toAuthAdminError(link.error, 'auth.studentToken');
    const verified = await client.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token });
    if (verified.error) throw toAuthAdminError(verified.error, 'auth.studentSession');
    if (!verified.data.user) throw serviceUnavailable();

    return await acceptNewSession(client, verified.data.user.id, { role: 'STUDENT', credentialMessage: SIGN_IN_FAILURE_MESSAGES.STUDENT });
  } catch (error) {
    return functionFailure(error, 'auth.signInStudent');
  }
}

/**
 * ADMIN ONLY. LETS A TEACHER SIGN UP AGAIN (FORGOTTEN PASSWORD): THEIR SESSIONS
 * END, THEIR OLD PASSWORD IS REPLACED BY A RANDOM ONE NOBODY KNOWS, AND THEY
 * CHOOSE A NEW ONE ON THE TEACHER SIGN-UP PAGE.
 */
export async function resetTeacherSignUp(
  userId: string,
  options: { actor: AppUser; client?: DbClient },
): Promise<FunctionResult<TeacherSignUpReset>> {
  try {
    // DEFENSE IN DEPTH: THE ROUTE ALREADY RAN requireAdmin().
    if (options.actor.role !== 'ADMIN' || !options.actor.isActive) throw forbidden();
    const targetId = assertUuid(userId, 'id');
    const admin = options.client ?? createSupabaseAdminClient();

    const reset = resetSchema.parse(
      await rpcResult(
        'users.resetTeacherSignUp',
        admin.rpc('resetTeacherSignUp', { userId: targetId, actorUserId: options.actor.id }),
        { notFoundMessage: 'User not found.' },
      ),
    );
    const { error } = await admin.auth.admin.updateUserById(reset.authUserId, { password: randomBytes(32).toString('base64url') });
    if (error) throw toAuthAdminError(error, 'auth.clearTeacherPassword');

    return functionSuccess({ userId: targetId, revokedSessions: reset.revokedSessions });
  } catch (error) {
    return functionFailure(error, 'users.resetTeacherSignUp');
  }
}
