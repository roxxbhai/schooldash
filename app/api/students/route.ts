import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireRole } from "@/lib/auth/authorization";
import { createStudent, createStudentSchema, listStudents, listStudentsQuerySchema } from "@/lib/students/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admins: all students. Teachers: students they teach (RLS). ?classId= ?isActive= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listStudentsQuerySchema);
  const { items, pagination } = await listStudents(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. Creates the login identity and student account (role fixed to STUDENT). */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createStudentSchema);
  return created(await createStudent(supabase, input, actor));
});
