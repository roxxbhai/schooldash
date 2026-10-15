import "server-only";
import { isAuthApiError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { conflict, validationError } from "@/lib/api/errors";
import { logServerError } from "@/lib/api/log";
import { toValidationIssues } from "@/lib/api/validation";
import { DataAccessError } from "@/lib/auth/repository";
import type { AppRole, DbUserRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Trusted, server-only account provisioning.
 *
 * Creates (or links) a Supabase Auth identity and its application `users`
 * row, plus the student/teacher profile, using the secret-key client. This is
 * the ONLY place that assigns roles. Callers must already have authorized the
 * operation — the initial-admin CLI (scripts/bootstrap-admin.ts) or, from
 * Phase 3, admin-only Route Handlers guarded by `requireAdmin()`. Never expose
 * it through a public endpoint, and never pass a role taken from request data
 * without checking the caller may grant it.
 *
 * Auth and Postgres cannot share a transaction, so:
 *   1. the Auth user is created (or an existing one is found and linked);
 *   2. `public."provisionAppUser"` inserts users + profile + audit entry in a
 *      single database transaction;
 *   3. if step 2 fails and step 1 created the Auth user, that Auth user is
 *      deleted again (compensation). If even that fails, a
 *      `ProvisioningRecoveryError` names the orphaned Auth user so an operator
 *      can re-run provisioning with `linkExistingAuthUser` or delete it.
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

const teacherProfileSchema = z.strictObject({
  employeeCode: z.string().trim().min(1).max(50),
  qualification: optionalText,
  dateOfJoining: optionalDate,
});

const baseSchema = {
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: z.string().trim().min(1).max(200),
  /** Initial password. Omit to create the identity without one (set via reset/invite). */
  password: z.string().min(12).max(72).optional(),
};

const provisionInputSchema = z.discriminatedUnion("role", [
  z.strictObject({ ...baseSchema, role: z.literal("ADMIN") }),
  z.strictObject({ ...baseSchema, role: z.literal("TEACHER"), profile: teacherProfileSchema }),
  z.strictObject({ ...baseSchema, role: z.literal("STUDENT"), profile: studentProfileSchema }),
]);

export type ProvisionAccountInput = z.input<typeof provisionInputSchema>;

export interface ProvisionOptions {
  /** `users.id` of the admin performing the action; null for the bootstrap CLI. */
  actorUserId?: string | null;
  /**
   * Link an Auth user that already exists for this email instead of failing.
   * Used by the initial-admin bootstrap and for recovering a partial failure.
   */
  linkExistingAuthUser?: boolean;
  /** Secret-key client; created from env if omitted. */
  client?: SupabaseClient<Database>;
}

export interface ProvisionedAccount {
  userId: string;
  authUserId: string;
  role: AppRole;
  /** False when an existing Auth user was linked. */
  createdAuthUser: boolean;
}

/** Thrown when provisioning failed AND the compensating cleanup also failed. */
export class ProvisioningRecoveryError extends Error {
  readonly orphanedAuthUserId: string;

  constructor(orphanedAuthUserId: string) {
    super(
      `Provisioning failed and Auth user ${orphanedAuthUserId} could not be removed. ` +
        "Re-run provisioning with linkExistingAuthUser, or delete the user in the dashboard.",
    );
    this.name = "ProvisioningRecoveryError";
    this.orphanedAuthUserId = orphanedAuthUserId;
  }
}

const TO_DB_ROLE: Record<AppRole, DbUserRole> = {
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
};

export async function provisionAccount(
  rawInput: ProvisionAccountInput,
  options: ProvisionOptions = {},
): Promise<ProvisionedAccount> {
  const parsed = provisionInputSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(toValidationIssues(parsed.error));
  const input = parsed.data;

  const admin = options.client ?? createSupabaseAdminClient();

  // 1. Find or create the Auth identity.
  const existing = await admin.rpc("findAuthUserIdByEmail", { email: input.email });
  if (existing.error) throw new DataAccessError("auth.findUserByEmail", existing.error.code);

  let authUserId: string;
  let createdAuthUser = false;

  if (existing.data) {
    if (!options.linkExistingAuthUser) {
      throw conflict("An account with this email address already exists.");
    }
    authUserId = existing.data;
  } else {
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      if (isAuthApiError(created.error) && created.error.code === "email_exists") {
        throw conflict("An account with this email address already exists.");
      }
      logServerError("provisioning.createAuthUser", created.error);
      throw new DataAccessError("auth.createUser", created.error?.code ?? "UNKNOWN");
    }
    authUserId = created.data.user.id;
    createdAuthUser = true;
  }

  // 2. Create the application account atomically.
  const result = await admin.rpc("provisionAppUser", {
    authUserId,
    email: input.email,
    fullName: input.fullName,
    role: TO_DB_ROLE[input.role],
    profile: "profile" in input ? input.profile : {},
    actorUserId: options.actorUserId ?? undefined,
  });

  if (result.error || !result.data) {
    // 3. Compensate: never leave an Auth identity we created without an account.
    if (createdAuthUser) await removeAuthUser(admin, authUserId);
    throw mapProvisionError(result.error?.code);
  }

  return { userId: result.data, authUserId, role: input.role, createdAuthUser };
}

async function removeAuthUser(admin: SupabaseClient<Database>, authUserId: string): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (!error) return;
    logServerError("provisioning.compensate", error, { authUserId });
  } catch (error) {
    logServerError("provisioning.compensate", error, { authUserId });
  }
  throw new ProvisioningRecoveryError(authUserId);
}

function mapProvisionError(code: string | undefined): Error {
  switch (code) {
    case "23505": // unique: identity, email or admission/employee number already used
      return conflict("An account or profile with these details already exists.");
    case "22023": // missing required profile field
    case "22007": // invalid date
    case "22008":
      return validationError([{ path: "profile", message: "The profile is invalid." }]);
    default:
      return new DataAccessError("users.provision", code);
  }
}
