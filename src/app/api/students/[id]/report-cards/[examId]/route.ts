import { z } from 'zod';
import { requireAuthenticatedUser } from '@/functions/authorization';
import { buildReportCard } from '@/functions/report-cards';
import { apiRoute, ok } from '@/helpers/api-response';
import { unwrapResult } from '@/helpers/function-result';
import { parseParams, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

const reportCardParamsSchema = z.object({ id: uuidSchema, examId: uuidSchema });

/**
 * REPORT-CARD DATA FOR ONE STUDENT AND EXAM. ADMINS: ANY STUDENT. STUDENTS:
 * ONLY THEMSELVES. TEACHERS: STUDENTS THEY TEACH, LIMITED TO THEIR OWN SUBJECTS.
 * NO PERCENTAGE, GRADE OR PASS/FAIL — SEE @/functions/report-cards.
 */
export const GET = apiRoute(async (_request: Request, context: RouteContext<'/api/students/[id]/report-cards/[examId]'>) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const { id, examId } = await parseParams(context.params, reportCardParamsSchema);
  return ok(unwrapResult(await buildReportCard(supabase, id, examId, viewer)));
});
