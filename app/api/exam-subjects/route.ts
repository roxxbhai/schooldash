import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created, paginated } from "@/lib/api/response";
import { getPagination, parseJsonBody, parseQuery } from "@/lib/api/validation";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  createExamSubject,
  createExamSubjectSchema,
  listExamSubjects,
  listExamSubjectsQuerySchema,
} from "@/lib/exam-subjects/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** RLS-scoped: admins all, teachers classes they teach, students their class. ?examId= ?classId= ?subjectId= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  await requireAuthenticatedUser({ client: supabase });
  const searchParams = new URL(request.url).searchParams;
  const filters = parseQuery(searchParams, listExamSubjectsQuerySchema);
  const { items, pagination } = await listExamSubjects(supabase, getPagination(searchParams), filters);
  return paginated(items, pagination);
});

/** Admin only. { examId, classId, subjectId, maxMarks, passMarks?, examDate? } */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, createExamSubjectSchema);
  return created(await createExamSubject(supabase, input));
});
