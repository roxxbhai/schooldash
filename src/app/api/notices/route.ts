import { z } from 'zod';
import { AUDIENCES_SCHEMA, NOTICE_BODY_SCHEMA, NOTICE_COLUMNS, NOTICE_COLUMNS_WITH_AUDIENCES, NOTICE_ERRORS, NOTICE_TITLE_SCHEMA } from '@/constants/notices';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { findNotice, toAudienceRows } from '@/functions/notices';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { page, rpcResult } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { presentNotice } from '@/helpers/notices';
import { getPagination, parseJsonBody, parseQuery } from '@/helpers/request-validation';
import { optionalText } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { Constants } from '@/types/database';
import type { Notice, NoticeWithAudiences } from '@/types/notices';

/**
 * NOTICES: ANNOUNCEMENTS ADDRESSED TO ROLES AND/OR CLASSES.
 * LIFECYCLE (DATABASE-ENFORCED): DRAFT → PUBLISHED → ARCHIVED, OR DRAFT → ARCHIVED.
 * ONLY DRAFTS CAN BE EDITED OR RE-TARGETED; PUBLISHING NEEDS AN AUDIENCE; ARCHIVED
 * IS FINAL. ADMINS MANAGE NOTICES; TEACHERS AND STUDENTS READ ONLY PUBLISHED
 * NOTICES ADDRESSED TO THEM (RLS). NO DELETE ENDPOINT, NO DELIVERY (EMAIL/SMS).
 */

const createNoticeSchema = z.strictObject({
  title: NOTICE_TITLE_SCHEMA,
  body: NOTICE_BODY_SCHEMA,
  category: optionalText(50),
  audiences: AUDIENCES_SCHEMA.default([]),
});
const listNoticesQuerySchema = z.object({ status: z.enum(Constants.public.Enums.noticeStatus).optional() });

/** ADMINS: EVERY NOTICE WITH ITS AUDIENCES. OTHERS: PUBLISHED NOTICES ADDRESSED TO THEM. ?STATUS= */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  const viewer = unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const { status } = parseQuery(searchParams, listNoticesQuerySchema);
  const pagination = getPagination(searchParams);

  const isAdminView = viewer.role === 'ADMIN';
  let query = supabase.from('notices').select(isAdminView ? NOTICE_COLUMNS_WITH_AUDIENCES : NOTICE_COLUMNS, { count: 'exact' });
  if (status) query = query.eq('status', status);
  const rows = query
    .order('publishedAt', { ascending: false, nullsFirst: false })
    .order('createdAt', { ascending: false })
    .order('id')
    .range(pagination.from, pagination.to)
    .overrideTypes<(Notice | NoticeWithAudiences)[], { merge: false }>();
  const list = await page<Notice | NoticeWithAudiences>('notices.list', rows, pagination, NOTICE_ERRORS);
  return paginated({ ...list, items: list.items.map(presentNotice) });
});

/**
 * ADMIN ONLY. CREATES A DRAFT TOGETHER WITH ITS AUDIENCES IN ONE DATABASE
 * TRANSACTION (`createNotice`), WITH THE CALLER AS THE AUTHOR.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const draft = await parseJsonBody(request, createNoticeSchema);
  const audiences = unwrapResult(await toAudienceRows(supabase, draft.audiences));
  const noticeId = await rpcResult<string>(
    'notices.create',
    // THE FUNCTION ACCEPTS A NULL CATEGORY, BUT THE GENERATED ARGUMENT TYPE IS A NON-NULL STRING. THE KEY MUST
    // ALWAYS BE SENT (AN OMITTED ARGUMENT WOULD NOT MATCH THE FUNCTION), SO A MISSING CATEGORY IS SENT AS NULL.
    supabase.rpc('createNotice', { title: draft.title, body: draft.body, category: (draft.category ?? null) as string, audiences }),
    NOTICE_ERRORS,
  );
  return created(unwrapResult(await findNotice(supabase, noticeId, true)));
});
