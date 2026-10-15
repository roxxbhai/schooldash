import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createSubject, createSubjectSchema, listSubjects, listSubjectsQuerySchema } from "@/lib/subjects/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Any active user. Optional ?search= matches code or name. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const { search } = parseQuery(searchParams, listSubjectsQuerySchema);
  const { items, pagination } = await listSubjects(supabase, getPagination(searchParams), search);
  return paginated(items, pagination);
});

/** Admin only. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createSubjectSchema);
  return created(await createSubject(supabase, input));
});
