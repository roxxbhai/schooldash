import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getTimetableEntry,
  removeTimetableEntry,
  updateTimetableEntry,
  updateTimetableEntrySchema,
} from "@/lib/timetable/service";

type Context = RouteContext<"/api/timetable-entries/[id]">;

/** RLS-scoped; otherwise 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getTimetableEntry(supabase, id));
});

/** Admin only. Any of classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateTimetableEntrySchema);
  return ok(await updateTimetableEntry(supabase, id, input));
});

/** Admin only. Returns the removed entry. */
export const DELETE = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await removeTimetableEntry(supabase, id));
});
