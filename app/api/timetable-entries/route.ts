import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createTimetableEntry,
  createTimetableEntrySchema,
  listTimetableEntries,
  listTimetableQuerySchema,
} from "@/lib/timetable/service";

/**
 * RLS-scoped: admins all, teachers their own periods and classes they teach,
 * students their classes. ?academicYearId= ?classId= ?teacherId= ?subjectId= ?dayOfWeek=
 */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listTimetableQuerySchema);
  const { items, pagination } = await listTimetableEntries(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. { classId, subjectId, teacherId?, dayOfWeek, startTime, endTime, room? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createTimetableEntrySchema);
  return created(await createTimetableEntry(supabase, input));
});
