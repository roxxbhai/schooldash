import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTeacher, createTeacherSchema, listTeachers, listTeachersQuerySchema } from "@/lib/teachers/service";

/** Admin only. ?isActive=true|false */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listTeachersQuerySchema);
  const { items, pagination } = await listTeachers(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. Creates the login identity and teacher account (role fixed to TEACHER). */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createTeacherSchema);
  return created(await createTeacher(supabase, input, actor));
});
