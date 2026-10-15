import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  createEnrollment,
  createEnrollmentSchema,
  listEnrollments,
  listEnrollmentsQuerySchema,
} from "@/lib/enrollments/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admins: all. Teachers: classes they teach. Students: their own. ?studentId= ?classId= ?academicYearId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listEnrollmentsQuerySchema);
  const { items, pagination } = await listEnrollments(supabase, getPagination(searchParams), filters, viewer);
  return paginated(items, pagination);
});

/** Admin only. The academic year comes from the class. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createEnrollmentSchema);
  return created(await createEnrollment(supabase, input));
});
