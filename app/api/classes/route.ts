import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createClass, createClassSchema, listClasses, listClassesQuerySchema } from "@/lib/classes/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admins: all classes. Teachers: classes they teach. Students: their class (RLS-scoped). ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listClassesQuerySchema);
  const { items, pagination } = await listClasses(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createClassSchema);
  return created(await createClass(supabase, input));
});
