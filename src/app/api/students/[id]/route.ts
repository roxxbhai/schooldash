import { z } from 'zod';
import { ADMISSION_NUMBER_SCHEMA, STUDENT_ERRORS } from '@/constants/students';
import { requireAdmin, requireAuthenticatedUser, requireStudentOwnership } from '@/functions/authorization';
import { findStudent } from '@/functions/students';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams } from '@/helpers/request-validation';
import { definedOnly, fullNameSchema, optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

type Context = RouteContext<'/api/students/[id]'>;

const updateStudentSchema = z.strictObject({
  fullName: fullNameSchema.optional(),
  phone: optionalText(30),
  admissionNumber: ADMISSION_NUMBER_SCHEMA.optional(),
  admissionDate: z.iso.date().nullable().optional(),
  dateOfBirth: z.iso.date().nullable().optional(),
  gender: optionalText(30),
  bloodGroup: optionalText(10),
  fatherName: optionalText(200),
  motherName: optionalText(200),
  address: optionalText(500),
});

/** ADMINS: ANY. TEACHERS: STUDENTS THEY TEACH (RLS; ELSE 404). STUDENTS: ONLY THEMSELVES (ELSE 403). */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  if (viewer.role === 'STUDENT') unwrapResult(await requireStudentOwnership(supabase, id));
  return ok(unwrapResult(await findStudent(supabase, id)));
});

/**
 * ADMIN ONLY. fullName/phone (USERS) AND THE PROFILE FIELDS (STUDENTS) ARE
 * UPDATED IN ONE TRANSACTION BY THE `updateStudentProfile` DATABASE FUNCTION.
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { fullName, phone, ...profile } = requireChanges(await parseJsonBody(request, updateStudentSchema));
  await rpcResult(
    'students.update',
    supabase.rpc('updateStudentProfile', { studentId: id, userPatch: definedOnly({ fullName, phone }), profilePatch: definedOnly(profile) }),
    STUDENT_ERRORS,
  );
  return ok(unwrapResult(await findStudent(supabase, id)));
});
