import "server-only";
import { ApiError, notFound } from "@/lib/api/errors";
import { mapDbError } from "@/lib/api/db-errors";
import type { DbErrorContext, DbErrorLike } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";

/**
 * Helpers for repository modules. Every Supabase result is checked: a failed
 * query always throws a mapped error, never returns partial or empty data in
 * place of an error.
 */

interface QueryResult<T> {
  data: T | null;
  error: DbErrorLike | null;
  count?: number | null;
}

/** Rows from a list query. */
export async function many<T>(
  operation: string,
  query: PromiseLike<QueryResult<T[]>>,
  context?: DbErrorContext,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw mapDbError(error, operation, context);
  return data ?? [];
}

/** A single row or null (use with `.maybeSingle()`). */
export async function maybeOne<T>(
  operation: string,
  query: PromiseLike<QueryResult<T>>,
  context?: DbErrorContext,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw mapDbError(error, operation, context);
  return data ?? null;
}

/** A single row; 404 if it doesn't exist or RLS hides it. */
export async function one<T>(
  operation: string,
  query: PromiseLike<QueryResult<T>>,
  context?: DbErrorContext,
): Promise<T> {
  const row = await maybeOne(operation, query, context);
  if (row === null) throw notFound(context?.notFoundMessage);
  return row;
}

/** Result of an RPC that returns a value; errors are mapped. */
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
 * The row, or null if it doesn't exist (404). Any other failure — e.g. the
 * database being unreachable — is rethrown, never mistaken for "missing".
 */
export async function orNullIfMissing<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * A page of rows. The query must request `{ count: "exact" }` and apply
 * `.range(pagination.from, pagination.to)`. A page past the end returns no
 * items (PostgREST reports it as PGRST103) rather than an error.
 */
export async function page<T>(
  operation: string,
  query: PromiseLike<QueryResult<T[]>>,
  context?: DbErrorContext,
): Promise<Page<T>> {
  const { data, error, count } = await query;
  if (error) {
    if (error.code === "PGRST103") return { items: [], total: count ?? 0 };
    throw mapDbError(error, operation, context);
  }
  return { items: data ?? [], total: count ?? data?.length ?? 0 };
}

export function pageMeta(pagination: Pagination, total: number) {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
