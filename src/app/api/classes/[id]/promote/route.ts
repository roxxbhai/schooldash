import { z } from 'zod';
import { MAX_PROMOTION_STUDENTS, PROMOTION_ERRORS, PROMOTION_RESULT_SCHEMA } from '@/constants/class-promotion';
import { ROLL_NUMBER_SCHEMA } from '@/constants/enrollments';
import { requireRole } from '@/functions/authorization';
import { validationError } from '@/helpers/api-error';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

const promoteSchema = z.strictObject({
  targetClassId: uuidSchema,
  students: z
    .array(z.strictObject({ studentId: uuidSchema, rollNumber: ROLL_NUMBER_SCHEMA.nullable() }))
    .min(1)
    .max(MAX_PROMOTION_STUDENTS)
    .refine((students) => new Set(students.map((student) => student.studentId)).size === students.length, { message: 'Each student can be listed once.' }),
});

/**
 * ADMINS AND THE CLASS'S CLASS TEACHER. ENROLLS THE CHOSEN STUDENTS OF THIS CLASS IN
 * `targetClassId` (A CLASS OF A LATER ACADEMIC YEAR) WITH THE GIVEN ROLL NUMBERS, ALL IN
 * ONE DATABASE TRANSACTION (`promoteStudents`, MIGRATION 20). INACTIVE STUDENTS AND
 * STUDENTS ALREADY ENROLLED IN THAT YEAR ARE SKIPPED AND LISTED. A ROLL NUMBER THAT IS
 * TAKEN (OR GIVEN TWICE) IS A 422 ON THAT STUDENT, AND NOTHING IS WRITTEN.
 */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/classes/[id]/promote'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { targetClassId, students } = await parseJsonBody(request, promoteSchema);

  const raw = await rpcResult(
    'classes.promote',
    supabase.rpc('promoteStudents', { sourceClassId: id, targetClassId, students }),
    PROMOTION_ERRORS,
  );
  const result = PROMOTION_RESULT_SCHEMA.parse(raw);
  if (result.status === 'rollConflicts') {
    const indexById = new Map(students.map((student, index) => [student.studentId, index]));
    throw validationError(
      result.conflicts.map((conflict) => ({
        path: `students.${indexById.get(conflict.studentId) ?? 0}.rollNumber`,
        message: `Roll number ${conflict.rollNumber} is already taken in that class.`,
      })),
    );
  }
  return ok({ promoted: result.promoted, skipped: result.skipped });
});
