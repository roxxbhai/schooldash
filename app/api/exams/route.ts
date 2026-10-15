import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createExam, createExamSchema, listExams, listExamsQuerySchema } from "@/lib/exams/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Any active user. ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listExamsQuerySchema);
  const { items, pagination } = await listExams(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. { academicYearId, name, startDate?, endDate? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createExamSchema);
  return created(await createExam(supabase, input));
});
