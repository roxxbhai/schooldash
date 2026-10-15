import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { z } from "zod";
import { DB_USER_ROLES } from "@/lib/auth/roles";
import type { DbUserRole } from "@/lib/auth/roles";

/**
 * Database access for authentication and authorization.
 *
 * Every query here runs through the caller's user-scoped client (anon key +
 * session), so Row Level Security applies — the admin client is never used
 * for these reads. Keeping all queries in this module lets the guards be unit
 * tested with this module mocked, and lets these queries be integration
 * tested once a Supabase project exists.
 *
 * NOTE: these queries have not been run against a live database yet.
 */

/** A failed query. `unavailable` marks network-level failures (→ 503). */
export class DataAccessError extends Error {
  readonly operation: string;
  readonly code?: string;
  readonly unavailable: boolean;

  constructor(operation: string, code?: string) {
    super(`Data access failed: ${operation}`);
    this.name = "DataAccessError";
    this.operation = operation;
    this.code = code || undefined;
    // PostgREST errors always carry a code; supabase-js reports fetch
    // failures (Supabase unreachable) with an empty one.
    this.unavailable = !code;
  }
}

export interface AppUserRecord {
  id: string;
  authUserId: string;
  role: DbUserRole;
  isActive: boolean;
}

const appUserRowSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid(),
  role: z.enum(DB_USER_ROLES),
  isActive: z.boolean(),
});

const idRowSchema = z.object({ id: z.uuid() });

type QueryResult = { data: unknown; error: { code?: string } | null };

function unwrap<T extends z.ZodType>(
  operation: string,
  result: QueryResult,
  schema: T,
): z.output<T> | null {
  if (result.error) throw new DataAccessError(operation, result.error.code);
  if (result.data === null || result.data === undefined) return null;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new DataAccessError(operation, "UNEXPECTED_ROW_SHAPE");
  return parsed.data;
}

/** The application `users` row linked to a Supabase Auth user, if any. */
export async function findAppUserByAuthUserId(
  client: SupabaseClient<Database>,
  authUserId: string,
): Promise<AppUserRecord | null> {
  const result = await client
    .from("users")
    .select("id, authUserId, role, isActive")
    .eq("authUserId", authUserId)
    .maybeSingle();
  return unwrap("users.findByAuthUserId", result, appUserRowSchema);
}

/** The `students.id` belonging to an application user, if any. */
export async function findStudentIdByUserId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const result = await client
    .from("students")
    .select("id")
    .eq("userId", userId)
    .maybeSingle();
  return unwrap("students.findByUserId", result, idRowSchema)?.id ?? null;
}

/** The `teachers.id` belonging to an application user, if any. */
export async function findTeacherIdByUserId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const result = await client
    .from("teachers")
    .select("id")
    .eq("userId", userId)
    .maybeSingle();
  return unwrap("teachers.findByUserId", result, idRowSchema)?.id ?? null;
}

export interface TeacherAssignmentQuery {
  teacherId: string;
  classId: string;
  subjectId?: string;
}

/**
 * Whether a teacher is assigned to a class (and, if given, a subject).
 *
 * With a subject: an exact `teacherAssignments` row is required.
 * Without one: any assignment in the class, or being its class teacher —
 * matching `app.teachesClass` in db/README.md.
 */
export async function teacherHasAssignment(
  client: SupabaseClient<Database>,
  { teacherId, classId, subjectId }: TeacherAssignmentQuery,
): Promise<boolean> {
  let assignments = client
    .from("teacherAssignments")
    .select("id")
    .eq("teacherId", teacherId)
    .eq("classId", classId);
  if (subjectId !== undefined) assignments = assignments.eq("subjectId", subjectId);

  const assignment = unwrap(
    "teacherAssignments.find",
    await assignments.limit(1).maybeSingle(),
    idRowSchema,
  );
  if (assignment) return true;
  if (subjectId !== undefined) return false;

  const classTeacher = unwrap(
    "classes.findByClassTeacher",
    await client
      .from("classes")
      .select("id")
      .eq("id", classId)
      .eq("classTeacherId", teacherId)
      .maybeSingle(),
    idRowSchema,
  );
  return classTeacher !== null;
}
