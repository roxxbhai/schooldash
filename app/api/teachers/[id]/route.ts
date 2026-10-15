import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacher, updateTeacher, updateTeacherSchema } from "@/lib/teachers/service";

type Context = RouteContext<"/api/teachers/[id]">;

/** Admins: any teacher. Teachers: only themselves. Students: 403. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getTeacher(supabase, id, viewer));
});

/** Admin only. fullName, phone, employeeCode, qualification, dateOfJoining (atomic). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateTeacherSchema);
  return ok(await updateTeacher(supabase, id, input));
});
