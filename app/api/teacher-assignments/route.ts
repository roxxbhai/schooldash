import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createAssignment,
  createAssignmentSchema,
  listAssignments,
  listAssignmentsQuerySchema,
} from "@/lib/teacher-assignments/service";

/** Admins: all. Teachers: their own. Students: their class's. ?teacherId= ?classId= ?subjectId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listAssignmentsQuerySchema);
  const { items, pagination } = await listAssignments(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. Teachers cannot assign themselves. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createAssignmentSchema);
  return created(await createAssignment(supabase, input));
});
