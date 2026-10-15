import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAssignment, removeAssignment } from "@/lib/teacher-assignments/service";

type Context = RouteContext<"/api/teacher-assignments/[id]">;

/** Visible per RLS; otherwise 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getAssignment(supabase, id));
});

/** Admin only. 409 while timetable entries use the assignment. Returns the removed row. */
export const DELETE = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await removeAssignment(supabase, id));
});
