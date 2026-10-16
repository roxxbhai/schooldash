import 'server-only';
import type { z } from 'zod';
import { ApiError, DataAccessError, notFound } from '@/helpers/api-error';
import { mapDbError } from '@/helpers/db-error';
import type { PaginatedList, Pagination, PaginationMeta } from '@/types/api';
import type { DbErrorContext, QueryResult } from '@/types/supabase';

/**
 * WRAPPERS FOR SUPABASE QUERIES. EVERY RESULT IS CHECKED: A FAILED QUERY
 * ALWAYS THROWS A MAPPED, CLIENT-SAFE ERROR AND NEVER YIELDS PARTIAL OR EMPTY
 * DATA IN PLACE OF AN ERROR.
 */

/** ROWS FROM A LIST QUERY. */
export async function many<T>(
  operation: string,
  query: PromiseLike<QueryResult<T[]>>,
  context?: DbErrorContext,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw mapDbError(error, operation, context);
  return data ?? [];
}

/** A SINGLE ROW OR NULL (USE WITH `.maybeSingle()`). */
export async function maybeOne<T>(
  operation: string,
  query: PromiseLike<QueryResult<T>>,
  context?: DbErrorContext,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw mapDbError(error, operation, context);
  return data ?? null;
}

/** A SINGLE ROW; 404 IF IT DOESN'T EXIST OR RLS HIDES IT. */
export async function one<T>(
  operation: string,
  query: PromiseLike<QueryResult<T>>,
  context?: DbErrorContext,
): Promise<T> {
  const row = await maybeOne(operation, query, context);
  if (row === null) throw notFound(context?.notFoundMessage);
  return row;
}

/** RESULT OF AN RPC THAT RETURNS A VALUE; ERRORS ARE MAPPED. */
export async function rpcResult<T>(
  operation: string,
  query: PromiseLike<QueryResult<T>>,
  context?: DbErrorContext,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw mapDbError(error, operation, context);
  return data as T;
}

/**
 * THE ROW, OR NULL IF IT DOESN'T EXIST (404). ANY OTHER FAILURE — E.G. THE
 * DATABASE BEING UNREACHABLE — IS RETHROWN, NEVER MISTAKEN FOR "MISSING".
 */
export async function orNullIfMissing<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function pageMeta(pagination: Pagination, total: number): PaginationMeta {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

/**
 * A PAGE OF ROWS WITH ITS PAGINATION METADATA. THE QUERY MUST REQUEST
 * `{ count: 'exact' }` AND APPLY `.range(pagination.from, pagination.to)`. A
 * PAGE PAST THE END RETURNS NO ITEMS (POSTGREST REPORTS IT AS PGRST103)
 * RATHER THAN AN ERROR.
 */
export async function page<T>(
  operation: string,
  query: PromiseLike<QueryResult<T[]>>,
  pagination: Pagination,
  context?: DbErrorContext,
): Promise<PaginatedList<T>> {
  const { data, error, count } = await query;
  if (error?.code === 'PGRST103') return { items: [], pagination: pageMeta(pagination, count ?? 0) };
  if (error) throw mapDbError(error, operation, context);
  const items = data ?? [];
  return { items, pagination: pageMeta(pagination, count ?? items.length) };
}

/**
 * VALIDATES THE SHAPE OF A SINGLE ROW WITH ZOD. A QUERY ERROR OR AN
 * UNEXPECTED SHAPE THROWS `DataAccessError`; NO ROW YIELDS NULL. USED WHERE
 * AUTHORIZATION DECISIONS DEPEND ON THE ROW, SO A MALFORMED ONE NEVER GRANTS ACCESS.
 */
export function parseRow<T extends z.ZodType>(
  operation: string,
  result: { data: unknown; error: { code?: string } | null },
  schema: T,
): z.output<T> | null {
  if (result.error) throw new DataAccessError(operation, result.error.code);
  if (result.data === null || result.data === undefined) return null;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new DataAccessError(operation, 'UNEXPECTED_ROW_SHAPE');
  return parsed.data;
}
