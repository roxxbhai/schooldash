import { z } from 'zod';
import { PHONE_NUMBER_SCHEMA } from '@/constants/phone';
import { EMPLOYEE_CODE_SCHEMA, TEACHER_ERRORS } from '@/constants/teachers';
import { findTeacherIdByUserId, requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findTeacher } from '@/functions/teachers';
import { forbidden } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { definedOnly, fullNameSchema, optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

type Context = RouteContext<'/api/teachers/[id]'>;

const updateTeacherSchema = z.strictObject({
  fullName: fullNameSchema.optional(),
  // TEACHERS SIGN IN WITH THEIR PHONE NUMBER, SO IT CAN BE CHANGED BUT NOT REMOVED.
  phone: PHONE_NUMBER_SCHEMA.optional(),
  employeeCode: EMPLOYEE_CODE_SCHEMA.optional(),
  qualification: optionalText(200),
  dateOfJoining: z.iso.date().nullable().optional(),
});

/** ADMINS: ANY TEACHER. TEACHERS: ONLY THEMSELVES. STUDENTS: 403. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  if (viewer.role === 'STUDENT') throw forbidden();
  if (viewer.role === 'TEACHER' && unwrapResult(await findTeacherIdByUserId(supabase, viewer.id)) !== id) throw forbidden();
  return ok(unwrapResult(await findTeacher(supabase, id)));
});

/**
 * ADMIN ONLY. fullName/phone (USERS) AND THE PROFILE FIELDS (TEACHERS) ARE
 * UPDATED IN ONE TRANSACTION BY THE `updateTeacherProfile` DATABASE FUNCTION.
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { fullName, phone, ...profile } = requireChanges(await parseJsonBody(request, updateTeacherSchema));
  await rpcResult(
    'teachers.update',
    supabase.rpc('updateTeacherProfile', { teacherId: id, userPatch: definedOnly({ fullName, phone }), profilePatch: definedOnly(profile) }),
    TEACHER_ERRORS,
  );
  return ok(unwrapResult(await findTeacher(supabase, id)));
});
