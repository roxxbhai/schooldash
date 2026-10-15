import { z } from "zod";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams, uuidSchema } from "@/lib/api/validation";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { getReportCard } from "@/lib/report-cards/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: uuidSchema, examId: uuidSchema });

/**
 * Report-card data for one student and exam. Admins: any student. Students: themselves
 * (else 403). Teachers: students in classes they teach, limited to their own subjects.
 */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/students/[id]/report-cards/[examId]">) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const { id, examId } = await parseParams(context.params, paramsSchema);
  return ok(await getReportCard(supabase, id, examId, viewer));
});
