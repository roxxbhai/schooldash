import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, ok } from "@/lib/api/response";
import { parseJsonBody, parseParams } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { idParamsSchema } from "@/lib/school/validation";
import { getStudent, updateStudent, updateStudentSchema } from "@/lib/students/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = RouteContext<"/api/students/[id]">;

/** Admins: any. Teachers: students they teach (else 404). Students: only themselves (else 403). */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  const viewer = await requireAuthenticatedUser({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(await getStudent(supabase, id, viewer));
});

/** Admin only. Name, phone and profile fields (atomic). */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const { id } = await parseParams(context.params, idParamsSchema);
  const input = await parseJsonBody(request, updateStudentSchema);
  return ok(await updateStudent(supabase, id, input));
});
