import 'server-only';
import { z } from 'zod';
import { getCurrentAppUser } from '@/functions/session';
import { forbidden } from '@/helpers/api-error';
import { parseRow } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { assertUuid } from '@/helpers/request-validation';
import type { AppRole, AppUser, StudentAccess, TeacherAssignmentAccess, TeacherAssignmentQuery } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/**
 * AUTHORIZATION GUARDS AND THE LOOKUPS THEY DEPEND ON.
 *
 * EVERY GUARD RESOLVES THE CALLER FROM THE VALIDATED SUPABASE SESSION AND THE
 * DATABASE `users` ROW. IDS PASSED IN IDENTIFY THE RESOURCE BEING ACCESSED;
 * THEY ARE NEVER TREATED AS PROOF OF WHO THE CALLER IS. ALL QUERIES RUN WITH
 * THE CALLER'S CLIENT, SO ROW LEVEL SECURITY — THE SECOND, INDEPENDENT LAYER —
 * APPLIES TO THEM TOO.
 */

const idRowSchema = z.object({ id: z.uuid() });

/** THE `students.id` OF AN APPLICATION USER, IF ANY. */
async function findStudentIdByUserId(client: DbClient, userId: string): Promise<FunctionResult<string | null>> {
  try {
    const result = await client.from('students').select('id').eq('userId', userId).maybeSingle();
    return functionSuccess(parseRow('students.findByUserId', result, idRowSchema)?.id ?? null);
  } catch (error) {
    return functionFailure(error, 'students.findByUserId');
  }
}

/** THE `teachers.id` OF AN APPLICATION USER, IF ANY. */
export async function findTeacherIdByUserId(client: DbClient, userId: string): Promise<FunctionResult<string | null>> {
  try {
    const result = await client.from('teachers').select('id').eq('userId', userId).maybeSingle();
    return functionSuccess(parseRow('teachers.findByUserId', result, idRowSchema)?.id ?? null);
  } catch (error) {
    return functionFailure(error, 'teachers.findByUserId');
  }
}

/**
 * WHETHER A TEACHER IS ASSIGNED TO A CLASS (AND, IF GIVEN, A SUBJECT).
 * WITH A SUBJECT: AN EXACT `teacherAssignments` ROW IS REQUIRED. WITHOUT ONE:
 * ANY ASSIGNMENT IN THE CLASS, OR BEING ITS CLASS TEACHER — MATCHING
 * `app.teachesClass` IN THE DATABASE.
 */
export async function teacherHasAssignment(
  client: DbClient,
  { teacherId, classId, subjectId }: TeacherAssignmentQuery,
): Promise<FunctionResult<boolean>> {
  try {
    let assignmentQuery = client.from('teacherAssignments').select('id').eq('teacherId', teacherId).eq('classId', classId);
    if (subjectId !== undefined) assignmentQuery = assignmentQuery.eq('subjectId', subjectId);
    const assignment = parseRow('teacherAssignments.find', await assignmentQuery.limit(1).maybeSingle(), idRowSchema);
    if (assignment) return functionSuccess(true);
    if (subjectId !== undefined) return functionSuccess(false);

    const classTeacherResult = await client
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('classTeacherId', teacherId)
      .maybeSingle();
    return functionSuccess(parseRow('classes.findByClassTeacher', classTeacherResult, idRowSchema) !== null);
  } catch (error) {
    return functionFailure(error, 'teacherAssignments.find');
  }
}

/** WHETHER THE USER IS A TEACHER WHO TEACHES THE CLASS (AND, IF GIVEN, EXACTLY THAT SUBJECT IN IT). */
export async function teachesClass(
  client: DbClient,
  user: AppUser,
  target: { classId: string; subjectId?: string },
): Promise<FunctionResult<boolean>> {
  try {
    if (user.role !== 'TEACHER') return functionSuccess(false);
    const teacherId = unwrapResult(await findTeacherIdByUserId(client, user.id));
    if (!teacherId) return functionSuccess(false);
    return teacherHasAssignment(client, { teacherId, ...target });
  } catch (error) {
    return functionFailure(error, 'authorization.teachesClass');
  }
}

/** THE ACTIVE APPLICATION USER. 401 IF UNAUTHENTICATED, 403 IF UNPROVISIONED OR INACTIVE. */
export async function requireAuthenticatedUser(client: DbClient): Promise<FunctionResult<AppUser>> {
  return getCurrentAppUser(client);
}

/** THE ACTIVE USER, IF THEIR DATABASE ROLE IS ONE OF `allowedRoles`; OTHERWISE 401/403. */
export async function requireRole(client: DbClient, allowedRoles: readonly AppRole[]): Promise<FunctionResult<AppUser>> {
  try {
    if (allowedRoles.length === 0) throw new Error('requireRole needs at least one allowed role');
    const user = unwrapResult(await getCurrentAppUser(client));
    if (!allowedRoles.includes(user.role)) throw forbidden();
    return functionSuccess(user);
  } catch (error) {
    return functionFailure(error, 'authorization.requireRole');
  }
}

export async function requireAdmin(client: DbClient): Promise<FunctionResult<AppUser>> {
  return requireRole(client, ['ADMIN']);
}

/**
 * OWNERSHIP CHECK: THE CALLER IS THE STUDENT WITH `studentId`. ADMINS PASS ONLY
 * WITH `isAdminAllowed`. EVERY OTHER CALLER — INCLUDING TEACHERS — GETS 403.
 */
export async function requireStudentOwnership(
  client: DbClient,
  studentId: string,
  { isAdminAllowed = false }: { isAdminAllowed?: boolean } = {},
): Promise<FunctionResult<StudentAccess>> {
  try {
    const user = unwrapResult(await getCurrentAppUser(client));
    const targetId = assertUuid(studentId, 'studentId');
    if (user.role === 'ADMIN' && isAdminAllowed) return functionSuccess<StudentAccess>({ user, studentId: targetId, grantedBy: 'admin' });
    if (user.role !== 'STUDENT') throw forbidden();

    const ownStudentId = unwrapResult(await findStudentIdByUserId(client, user.id));
    if (ownStudentId === null || ownStudentId !== targetId) throw forbidden();
    return functionSuccess<StudentAccess>({ user, studentId: targetId, grantedBy: 'owner' });
  } catch (error) {
    return functionFailure(error, 'authorization.studentOwnership');
  }
}

/**
 * ASSIGNMENT CHECK: THE CALLER IS THE TEACHER WITH `teacherId` AND TEACHES THE
 * CLASS (AND SUBJECT, IF GIVEN). ADMINS ARE NOT IMPLICITLY ALLOWED — CHECK
 * `requireAdmin` SEPARATELY WHERE THEY SHOULD BE.
 */
export async function requireTeacherAssignment(
  client: DbClient,
  { teacherId, classId, subjectId }: TeacherAssignmentQuery,
): Promise<FunctionResult<TeacherAssignmentAccess>> {
  try {
    const user = unwrapResult(await getCurrentAppUser(client));
    const target = {
      teacherId: assertUuid(teacherId, 'teacherId'),
      classId: assertUuid(classId, 'classId'),
      ...(subjectId !== undefined ? { subjectId: assertUuid(subjectId, 'subjectId') } : {}),
    };
    if (user.role !== 'TEACHER') throw forbidden();

    const ownTeacherId = unwrapResult(await findTeacherIdByUserId(client, user.id));
    if (ownTeacherId === null || ownTeacherId !== target.teacherId) throw forbidden();
    if (!unwrapResult(await teacherHasAssignment(client, target))) throw forbidden();
    return functionSuccess({ user, ...target });
  } catch (error) {
    return functionFailure(error, 'authorization.teacherAssignment');
  }
}
