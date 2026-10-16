import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { createNotice, createNoticeSchema, listNotices, listNoticesQuerySchema } from "@/lib/notices/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Notices visible to the caller (RLS): admins every notice with its audiences;
 * teachers and students only published notices addressed to them. ?status=
 */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const user = await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listNoticesQuerySchema);
  const { items, pagination } = await listNotices(supabase, getPagination(searchParams), filters, user);
  return paginated(items, pagination);
});

/** Admin only. Creates a draft. { title, body, category?, audiences?: [{ role } | { classId }] } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createNoticeSchema);
  return created(await createNotice(supabase, input));
});
