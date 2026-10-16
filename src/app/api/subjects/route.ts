import { z } from 'zod';
import { SUBJECT_CODE_SCHEMA, SUBJECT_COLUMNS, SUBJECT_ERRORS, SUBJECT_NAME_SCHEMA } from '@/constants/subjects';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { apiRoute, created, paginated } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one, page } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { getPagination, parseJsonBody, parseQuery } from '@/helpers/request-validation';
import { optionalText, searchTermSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Subject } from '@/types/subjects';

/**
 * SUBJECTS. READ: ANY ACTIVE USER. WRITE: ADMINS. NEVER DELETED — TEACHER
 * ASSIGNMENTS, EXAMS, RESULTS AND TIMETABLES REFERENCE THEM.
 */

const createSubjectSchema = z.strictObject({ code: SUBJECT_CODE_SCHEMA, name: SUBJECT_NAME_SCHEMA, description: optionalText(500) });
const listSubjectsQuerySchema = z.object({ search: searchTermSchema.optional() });

/** ANY ACTIVE USER. OPTIONAL ?SEARCH= MATCHES CODE OR NAME. */
export const GET = apiRoute(async (request: Request) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const searchParams = new URL(request.url).searchParams;
  const { search } = parseQuery(searchParams, listSubjectsQuerySchema);
  const pagination = getPagination(searchParams);

  let query = supabase.from('subjects').select(SUBJECT_COLUMNS, { count: 'exact' });
  // `search` IS LIMITED TO [LETTERS DIGITS SPACE . _ -] BY searchTermSchema, SO IT
  // CANNOT INJECT POSTGREST FILTER SYNTAX (COMMAS, PARENTHESES).
  if (search) query = query.or(`code.ilike.*${search}*,name.ilike.*${search}*`);
  const rows = query.order('code').range(pagination.from, pagination.to);
  return paginated(await page<Subject>('subjects.list', rows, pagination, SUBJECT_ERRORS));
});

/** ADMIN ONLY. THE CODE IS STORED UPPER-CASE. */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const newSubject = await parseJsonBody(request, createSubjectSchema);
  const query = supabase.from('subjects').insert(newSubject).select(SUBJECT_COLUMNS).maybeSingle();
  return created(await one<Subject>('subjects.insert', query, SUBJECT_ERRORS));
});
