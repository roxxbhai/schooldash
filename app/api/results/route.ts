import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAuthenticatedUser, requireRole } from "@/lib/auth/authorization";
import { createResultSchema, enterResult, listResults, listResultsQuerySchema } from "@/lib/results/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admins: all. Teachers: papers whose class + subject they teach. Students: their own
 * (another studentId → 403). ?examId= ?examSubjectId= ?classId= ?subjectId= ?studentId=
 */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listResultsQuerySchema);
  const { items, pagination } = await listResults(supabase, getPagination(searchParams), filters, viewer);
  return paginated(items, pagination);
});

/** Admins, or teachers of the paper's class + subject. { examSubjectId, studentId, marksObtained, remarks? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const input = await parseJsonBody(request, createResultSchema);
  return created(await enterResult(supabase, input, actor));
});
