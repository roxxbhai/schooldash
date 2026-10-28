import { PROMOTION_ERRORS, PROMOTION_OPTIONS_SCHEMA } from '@/constants/class-promotion';
import { requireRole } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/**
 * ADMINS AND THE CLASS'S CLASS TEACHER (403 FOR ANYONE ELSE, CHECKED BY THE DATABASE).
 * WHAT PROMOTING THE CLASS NEEDS: EVERY CLASS OF A LATER ACADEMIC YEAR, WHERE THE
 * CLASS'S STUDENTS ARE ALREADY ENROLLED IN LATER YEARS, AND THE ROLL NUMBERS TAKEN
 * IN LATER CLASSES (MIGRATION 20).
 */
export const GET = apiRoute(async (_request: Request, context: RouteContext<'/api/classes/[id]/promotion'>) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { id } = await parseParams(context.params, idParamsSchema);
  const options = await rpcResult('classes.promotionOptions', supabase.rpc('classPromotionOptions', { classId: id }), PROMOTION_ERRORS);
  return ok(PROMOTION_OPTIONS_SCHEMA.parse(options));
});
