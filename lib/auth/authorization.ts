import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forbidden } from "@/lib/api/errors";
import { assertUuid } from "@/lib/api/validation";
import {
  findStudentIdByUserId,
  findTeacherIdByUserId,
  teacherHasAssignment,
} from "@/lib/auth/repository";
import type { AppRole } from "@/lib/auth/roles";
import { getCurrentAppUser } from "@/lib/auth/session";
import type { AppUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Authorization guards for Route Handlers and Server Functions.
 *
 * Every guard resolves the caller from the validated Supabase session and the
 * database `users` row. IDs passed in identify the *resource being accessed*;
 * they are never treated as proof of who the caller is. Guards throw
 * `ApiError`s (401/403/400) that `apiRoute` converts into responses.
 *
 * These checks are the application layer. RLS (documented in db/README.md,
 * not yet applied) is the second, independent layer in the database.
 */

export interface GuardOptions {
  /** Request-scoped client; created from the request cookies if omitted. */
  client?: SupabaseClient<Database>;
}

async function resolveClient(options: GuardOptions): Promise<SupabaseClient<Database>> {
  return options.client ?? (await createSupabaseServerClient());
}

/** The active application user. 401 if unauthenticated, 403 if unprovisioned/inactive. */
export async function requireAuthenticatedUser(options: GuardOptions = {}): Promise<AppUser> {
  return getCurrentAppUser(await resolveClient(options));
}

/** Requires the caller's database role to be one of `allowedRoles`. */
export async function requireRole(
  allowedRoles: readonly AppRole[],
  options: GuardOptions = {},
): Promise<AppUser> {
  if (allowedRoles.length === 0) {
    throw new Error("requireRole needs at least one allowed role");
  }
  const user = await requireAuthenticatedUser(options);
  if (!allowedRoles.includes(user.role)) throw forbidden();
  return user;
}

/** Requires an active administrator. */
export async function requireAdmin(options: GuardOptions = {}): Promise<AppUser> {
  return requireRole(["ADMIN"], options);
}

export interface StudentOwnershipOptions extends GuardOptions {
  /** Let admins through as well. Off by default; callers must opt in. */
  allowAdmin?: boolean;
}

export interface StudentAccess {
  user: AppUser;
  studentId: string;
  grantedBy: "owner" | "admin";
}

/**
 * Requires the caller to be the student identified by `studentId` (or an
 * admin, when `allowAdmin` is set). Teachers are always rejected here; their
 * access is authorized via `requireTeacherAssignment`.
 */
export async function requireStudentOwnership(
  studentId: string,
  options: StudentOwnershipOptions = {},
): Promise<StudentAccess> {
  const client = await resolveClient(options);
  const user = await getCurrentAppUser(client);
  const targetId = assertUuid(studentId, "studentId");

  if (user.role === "ADMIN" && options.allowAdmin === true) {
    return { user, studentId: targetId, grantedBy: "admin" };
  }
  if (user.role !== "STUDENT") throw forbidden();

  const ownStudentId = await findStudentIdByUserId(client, user.id);
  if (ownStudentId === null || ownStudentId !== targetId) throw forbidden();

  return { user, studentId: targetId, grantedBy: "owner" };
}

export interface TeacherAssignmentAccess {
  user: AppUser;
  teacherId: string;
  classId: string;
  subjectId?: string;
}

/**
 * Requires the caller to be the teacher `teacherId` *and* to be assigned to
 * `classId` (and `subjectId`, when given).
 *
 * `teacherId` must match the teacher profile linked to the session, so a
 * teacher cannot borrow another teacher's assignments by changing request
 * parameters. Admins are not admitted here; use `requireAdmin` for admin
 * paths.
 *
 * The assignment lookup lives in `teacherHasAssignment` (lib/auth/repository)
 * and is mocked in unit tests; it has not been verified against a live
 * database.
 */
export async function requireTeacherAssignment(
  teacherId: string,
  classId: string,
  subjectId?: string,
  options: GuardOptions = {},
): Promise<TeacherAssignmentAccess> {
  const client = await resolveClient(options);
  const user = await getCurrentAppUser(client);

  const target = {
    teacherId: assertUuid(teacherId, "teacherId"),
    classId: assertUuid(classId, "classId"),
    ...(subjectId !== undefined ? { subjectId: assertUuid(subjectId, "subjectId") } : {}),
  };

  if (user.role !== "TEACHER") throw forbidden();

  const ownTeacherId = await findTeacherIdByUserId(client, user.id);
  if (ownTeacherId === null || ownTeacherId !== target.teacherId) throw forbidden();

  if (!(await teacherHasAssignment(client, target))) throw forbidden();

  return { user, ...target };
}
