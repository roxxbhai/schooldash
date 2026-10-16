import { z } from 'zod';
import { ENROLLMENT_COLUMNS, ENROLLMENT_ERRORS, ROLL_NUMBER_SCHEMA } from '@/constants/enrollments';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findClass } from '@/functions/classes';
import { findEnrollment } from '@/functions/enrollments';
import { validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams, uuidSchema } from '@/helpers/request-validation';
import { requireChanges, unwrapReference } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Enrollment } from '@/types/enrollments';

type Context = RouteContext<'/api/enrollments/[id]'>;

const updateEnrollmentSchema = z.strictObject({ classId: uuidSchema.optional(), rollNumber: ROLL_NUMBER_SCHEMA.nullable().optional() });

/** VISIBLE PER RLS (ADMIN / TEACHER OF THE CLASS / THE STUDENT); OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findEnrollment(supabase, id)));
});

/**
 * ADMIN ONLY. rollNumber, AND classId WITHIN THE SAME ACADEMIC YEAR. MOVING AN
 * ENROLLMENT THAT ALREADY HAS ATTENDANCE OR RESULTS IS REFUSED BY THE DATABASE (409).
 */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateEnrollmentSchema));

  if (changes.classId) {
    const current = unwrapResult(await findEnrollment(supabase, id));
    const target = unwrapReference(await findClass(supabase, changes.classId), 'classId', 'Class not found.');
    if (target.academicYearId !== current.academicYearId) {
      throw validationError([{ path: 'classId', message: 'A student can only be moved to a class in the same academic year.' }]);
    }
  }
  const query = supabase.from('studentEnrollments').update(changes).eq('id', id).select(ENROLLMENT_COLUMNS).maybeSingle();
  return ok(await one<Enrollment>('enrollments.update', query, ENROLLMENT_ERRORS));
});
