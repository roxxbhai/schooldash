import { NOTICE_COLUMNS, NOTICE_ERRORS } from '@/constants/notices';
import { requireAdmin } from '@/functions/authorization';
import { explainRefusedChange, findNotice } from '@/functions/notices';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { maybeOne } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseParams } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Notice } from '@/types/notices';

/** ADMIN ONLY. DRAFT OR PUBLISHED → ARCHIVED (409 IF ALREADY ARCHIVED). ARCHIVED NOTICES ARE HIDDEN FROM TEACHERS AND STUDENTS. */
export const POST = apiRoute(async (request: Request, context: RouteContext<'/api/notices/[id]/archive'>) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);

  const query = supabase
    .from('notices')
    .update({ status: 'archived' })
    .eq('id', id)
    .in('status', ['draft', 'published'])
    .select(NOTICE_COLUMNS)
    .maybeSingle();
  const archived = await maybeOne<Notice>('notices.update', query, NOTICE_ERRORS);
  if (!archived) unwrapResult(await explainRefusedChange(supabase, id, 'The notice is already archived.'));
  return ok(unwrapResult(await findNotice(supabase, id, true)));
});
