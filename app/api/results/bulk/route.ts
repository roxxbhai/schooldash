import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { requireRole } from "@/lib/auth/authorization";
import { bulkResultsSchema, enterResults } from "@/lib/results/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admins, or teachers of the paper's class + subject. Marks for many students on one paper:
 * { examSubjectId, records: [{ studentId, marksObtained, remarks? }] } (max 200). All-or-nothing.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = await requireRole(["ADMIN", "TEACHER"], { client: supabase });
  const input = await parseJsonBody(request, bulkResultsSchema);
  return created(await enterResults(supabase, input, actor));
});
