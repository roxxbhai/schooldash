import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody } from "@/lib/api/validation";
import { createAcademicYear, createAcademicYearSchema, listAcademicYears } from "@/lib/academic-years/service";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Any active user. Newest first. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { items, pagination } = await listAcademicYears(supabase, getPagination(new URL(request.url).searchParams));
  return paginated(items, pagination);
});

/** Admin only. Use POST /api/academic-years/{id}/set-current to make it current. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createAcademicYearSchema);
  return created(await createAcademicYear(supabase, input));
});
