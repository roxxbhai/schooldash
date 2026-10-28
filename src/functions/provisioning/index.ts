import 'server-only';
import { randomUUID } from 'node:crypto';
import { isAuthApiError } from '@supabase/supabase-js';
import { z } from 'zod';
import { PHONE_NUMBER_SCHEMA } from '@/constants/phone';
import { conflict, DataAccessError, validationError } from '@/helpers/api-error';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import { logServerError } from '@/helpers/logger';
import { toValidationIssues } from '@/helpers/request-validation';
import { toDbRole } from '@/helpers/roles';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import type { FunctionResult } from '@/types/function-result';
import type { ProvisionedAccount, ProvisionOptions } from '@/types/provisioning';
import type { DbClient } from '@/types/supabase';

/**
 * TRUSTED, SERVER-ONLY ACCOUNT PROVISIONING.
 *
 * CREATES (OR LINKS) A SUPABASE AUTH IDENTITY AND ITS APPLICATION `users`
 * ROW, PLUS THE student/teacher PROFILE, USING THE SECRET-KEY CLIENT. THIS IS
 * THE ONLY PLACE THAT ASSIGNS ROLES. CALLERS MUST ALREADY HAVE AUTHORIZED THE
 * OPERATION — THE INITIAL-ADMIN CLI (scripts/bootstrap-admin.ts) OR, FROM
 * ADMIN-ONLY ROUTE HANDLERS GUARDED BY `requireAdmin()`. NEVER EXPOSE
 * IT THROUGH A PUBLIC ENDPOINT, AND NEVER PASS A ROLE TAKEN FROM REQUEST DATA
 * WITHOUT CHECKING THE CALLER MAY GRANT IT.
 *
 * AUTH AND POSTGRES CANNOT SHARE A TRANSACTION, SO:
 *   1. THE AUTH USER IS CREATED (OR AN EXISTING ONE IS FOUND AND LINKED);
 *   2. `public."provisionAppUser"` INSERTS USERS + PROFILE + AUDIT ENTRY IN A
 *      SINGLE DATABASE TRANSACTION;
 *   3. IF STEP 2 FAILS AND STEP 1 CREATED THE AUTH USER, THAT AUTH USER IS
 *      DELETED AGAIN (COMPENSATION). IF EVEN THAT FAILS, A
 *      `ProvisioningRecoveryError` NAMES THE ORPHANED AUTH USER SO AN OPERATOR
 *      CAN RE-RUN PROVISIONING WITH `linkExistingAuthUser` OR DELETE IT.
 */

const optionalText = z.string().trim().min(1).max(200).optional();
const optionalDate = z.iso.date().optional();

const studentProfileSchema = z.strictObject({
  admissionNumber: z.string().trim().min(1).max(50),
  admissionDate: optionalDate,
  dateOfBirth: optionalDate,
  gender: optionalText,
  bloodGroup: z.string().trim().min(1).max(10).optional(),
  fatherName: optionalText,
  motherName: optionalText,
  address: z.string().trim().min(1).max(500).optional(),
});

/** NO EMPLOYEE CODE: `provisionAppUser` GENERATES IT (MIGRATION 17). */
const teacherProfileSchema = z.strictObject({
  qualification: optionalText,
  dateOfJoining: optionalDate,
});

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const baseSchema = {
  fullName: z.string().trim().min(1).max(200),
  /** INITIAL PASSWORD. OMIT TO CREATE THE IDENTITY WITHOUT ONE (TEACHER SIGN-UP, ADMIN SETUP CODE, OR NONE FOR STUDENTS). */
  password: z.string().min(12).max(72).optional(),
};

// ADMINS SIGN IN WITH THEIR EMAIL. TEACHERS AND STUDENTS NEVER DO, SO FOR THEM IT IS AN OPTIONAL CONTACT ADDRESS (MIGRATION 19).
const provisionInputSchema = z.discriminatedUnion('role', [
  z.strictObject({ ...baseSchema, role: z.literal('ADMIN'), email: emailSchema }),
  // A TEACHER SIGNS IN WITH THIS NUMBER (MIGRATION 15).
  z.strictObject({ ...baseSchema, role: z.literal('TEACHER'), email: emailSchema.optional(), phone: PHONE_NUMBER_SCHEMA, profile: teacherProfileSchema }),
  z.strictObject({ ...baseSchema, role: z.literal('STUDENT'), email: emailSchema.optional(), profile: studentProfileSchema }),
]);

/**
 * SUPABASE AUTH NEEDS AN EMAIL FOR EVERY IDENTITY. AN ACCOUNT WITHOUT ONE GETS A
 * RANDOM ADDRESS ON THE RESERVED `.invalid` DOMAIN: IT CAN NEVER RECEIVE MAIL OR
 * CLASH WITH A REAL ADDRESS, AND IT IS NEVER STORED IN `users` OR SHOWN.
 */
function placeholderAuthEmail(): string {
  return `${randomUUID()}@no-email.schooldash.invalid`;
}

export type ProvisionAccountInput = z.input<typeof provisionInputSchema>;

/** PROVISIONING FAILED AND THE COMPENSATING CLEANUP ALSO FAILED (LOGGED WITH THE AUTH USER ID). */
class ProvisioningRecoveryError extends Error {
  readonly orphanedAuthUserId: string;

  constructor(orphanedAuthUserId: string) {
    super(
      `Provisioning failed and Auth user ${orphanedAuthUserId} could not be removed. ` +
        'Re-run provisioning with linkExistingAuthUser, or delete the user in the dashboard.',
    );
    this.name = 'ProvisioningRecoveryError';
    this.orphanedAuthUserId = orphanedAuthUserId;
  }
}

export async function provisionAccount(
  rawInput: ProvisionAccountInput,
  options: ProvisionOptions = {},
): Promise<FunctionResult<ProvisionedAccount>> {
  try {
    return functionSuccess(await createAccount(rawInput, options));
  } catch (error) {
    return functionFailure(error, 'provisioning.provisionAccount');
  }
}

async function createAccount(rawInput: ProvisionAccountInput, options: ProvisionOptions): Promise<ProvisionedAccount> {
  const parsed = provisionInputSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(toValidationIssues(parsed.error));
  const input = parsed.data;

  const admin = options.client ?? createSupabaseAdminClient();

  // 1. FIND OR CREATE THE AUTH IDENTITY. WITHOUT AN EMAIL THERE IS NOTHING TO LINK TO, SO A NEW ONE IS ALWAYS CREATED.
  let existingAuthUserId: string | null = null;
  if (input.email) {
    const existing = await admin.rpc('findAuthUserIdByEmail', { email: input.email });
    if (existing.error) throw new DataAccessError('auth.findUserByEmail', existing.error.code);
    existingAuthUserId = existing.data;
  }

  let authUserId: string;
  let isAuthUserCreated = false;

  if (existingAuthUserId) {
    if (!options.linkExistingAuthUser) {
      throw conflict('An account with this email address already exists.');
    }
    authUserId = existingAuthUserId;
  } else {
    const created = await admin.auth.admin.createUser({
      email: input.email ?? placeholderAuthEmail(),
      password: input.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      if (isAuthApiError(created.error) && created.error.code === 'email_exists') {
        throw conflict('An account with this email address already exists.');
      }
      logServerError('provisioning.createAuthUser', created.error);
      throw new DataAccessError('auth.createUser', created.error?.code ?? 'UNKNOWN');
    }
    authUserId = created.data.user.id;
    isAuthUserCreated = true;
  }

  // 2. CREATE THE APPLICATION ACCOUNT ATOMICALLY.
  const result = await admin.rpc('provisionAppUser', {
    authUserId,
    // THE FUNCTION STORES A NULL EMAIL AS "NO EMAIL", BUT THE GENERATED ARGUMENT TYPE IS A NON-NULL STRING.
    email: (input.email ?? null) as string,
    fullName: input.fullName,
    role: toDbRole(input.role),
    profile: 'profile' in input ? input.profile : {},
    actorUserId: options.actorUserId ?? undefined,
    phone: 'phone' in input ? input.phone : undefined,
  });

  if (result.error || !result.data) {
    // 3. COMPENSATE: NEVER LEAVE AN AUTH IDENTITY WE CREATED WITHOUT AN ACCOUNT.
    if (isAuthUserCreated) await removeAuthUser(admin, authUserId);
    throw mapProvisionError(result.error?.code, result.error?.message);
  }

  // 4. AN IDENTITY CREATED WITH A PASSWORD, OR AN EXISTING ONE (CREATED WITH A PASSWORD IN
  //    THE DASHBOARD), NEEDS NO SIGN-UP OR SETUP CODE. BEST EFFORT: ONLY THE "SETUP PENDING" LABEL DEPENDS ON IT.
  if (input.password || !isAuthUserCreated) await markPasswordSet(admin, result.data);

  return { userId: result.data, authUserId, role: input.role, isAuthUserCreated };
}

async function markPasswordSet(admin: DbClient, userId: string): Promise<void> {
  const { error } = await admin.from('users').update({ passwordSetAt: new Date().toISOString() }).eq('id', userId);
  if (error) logServerError('provisioning.markPasswordSet', error, { userId });
}

async function removeAuthUser(admin: DbClient, authUserId: string): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (!error) return;
    logServerError('provisioning.compensate', error, { authUserId });
  } catch (error) {
    logServerError('provisioning.compensate', error, { authUserId });
  }
  throw new ProvisioningRecoveryError(authUserId);
}

function mapProvisionError(code: string | undefined, message: string | undefined): Error {
  switch (code) {
    case '23505': // UNIQUE: IDENTITY, EMAIL, TEACHER PHONE OR ADMISSION NUMBER ALREADY USED
      if (message?.includes('usersTeacherPhoneKey')) return conflict('Another teacher already uses this phone number.');
      return conflict('An account or profile with these details already exists.');
    case '22023': // MISSING REQUIRED PROFILE FIELD
    case '22007': // INVALID DATE
    case '22008':
      return validationError([{ path: 'profile', message: 'The profile is invalid.' }]);
    default:
      return new DataAccessError('users.provision', code);
  }
}
