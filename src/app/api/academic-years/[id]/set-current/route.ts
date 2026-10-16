import { ACADEMIC_YEAR_ERRORS } from '@/constants/academic-years';
import { findAcademicYear } from '@/functions/academic-years';
import { requireAdmin } from '@/functions/authorization';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

/** ADMIN ONLY. ATOMICALLY MAKES THIS THE ONLY CURRENT ACADEMIC YEAR (ONE DATABASE TRANSACTION). IDEMPOTENT. */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/academic-years/[id]/set-current'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  await rpcResult('academicYears.setCurrent', supabase.rpc('setCurrentAcademicYear', { academicYearId: id }), ACADEMIC_YEAR_ERRORS);
  return ok(unwrapResult(await findAcademicYear(supabase, id)));
});
