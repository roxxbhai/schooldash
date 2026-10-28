import { z } from 'zod';
import { GRADUATION_RESULT_SCHEMA, MAX_PROMOTION_STUDENTS, PROMOTION_ERRORS } from '@/constants/class-promotion';
import { requireRole } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { todayInSchool } from '@/helpers/format';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

const graduateSchema = z.strictObject({
  studentIds: z
    .array(uuidSchema)
    .min(1)
    .max(MAX_PROMOTION_STUDENTS)
    .refine((studentIds) => new Set(studentIds).size === studentIds.length, { message: 'Each student can be listed once.' }),
});

/**
 * ADMINS AND THE CLASS'S CLASS TEACHER; CLASS 12 ONLY. MARKS THE CHOSEN STUDENTS AS
 * GRADUATED TODAY (SCHOOL TIME) AND DEACTIVATES THEIR ACCOUNTS, REVOKING THEIR
 * SESSIONS, IN ONE DATABASE TRANSACTION (`graduateStudents`, MIGRATION 20). THEIR
 * RECORDS ARE KEPT. STUDENTS ALREADY GRADUATED, INACTIVE OR HELD BACK (ENROLLED IN A
 * LATER YEAR) ARE SKIPPED AND LISTED.
 */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/classes/[id]/graduate'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  const { studentIds } = await parseJsonBody(request, graduateSchema);

  const raw = await rpcResult(
    'classes.graduate',
    supabase.rpc('graduateStudents', { sourceClassId: id, studentIds, graduatedOn: todayInSchool() }),
    PROMOTION_ERRORS,
  );
  const result = GRADUATION_RESULT_SCHEMA.parse(raw);
  return ok({ graduated: result.graduated, skipped: result.skipped });
});
