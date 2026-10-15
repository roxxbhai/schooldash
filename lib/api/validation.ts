import "server-only";
import { z } from "zod";
import { badRequest, invalidJson, validationError } from "@/lib/api/errors";
import type { ValidationIssue } from "@/lib/api/errors";

/**
 * Request validation helpers. Each one returns typed, validated data or
 * throws an `ApiError` that `apiRoute` turns into a safe response.
 *
 * Status codes: invalid JSON → 400; JSON that fails the schema → 422;
 * invalid route params or query string → 400. All validation failures use
 * code `VALIDATION_ERROR` and list issues by path, never echoing values.
 */

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
  status: 400 | 422,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(toValidationIssues(result.error), status);
  }
  return result.data;
}

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

/** Parses and validates a JSON request body. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw badRequest("The request body must be sent as application/json.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalidJson();
  }

  return parseOrThrow(schema, body, 422);
}

/**
 * Validates dynamic route params. Accepts the `params` promise Next.js passes
 * to Route Handlers, or an already-resolved object.
 */
export async function parseParams<T extends z.ZodType>(
  params: unknown,
  schema: T,
): Promise<z.output<T>> {
  return parseOrThrow(schema, await params, 400);
}

/**
 * Validates query-string parameters. Repeated keys become arrays, so a
 * schema expecting a single string rejects `?page=1&page=2`.
 */
export function parseQuery<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T,
): z.output<T> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return parseOrThrow(schema, query, 400);
}

/** A UUID route/query/body value (any RFC 9562 version). */
export const uuidSchema = z.uuid({ message: "Must be a valid UUID." });

/** Validates a single UUID outside a schema, e.g. inside an authorization guard. */
export function assertUuid(value: unknown, path: string): string {
  return parseOrThrow(z.object({ [path]: uuidSchema }), { [path]: value }, 400)[path];
}

// --- Pagination --------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

function positiveIntegerParam(name: string) {
  return z
    .string()
    .regex(/^\d+$/, `${name} must be a positive integer.`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, `${name} must be a positive integer.`)
        .max(Number.MAX_SAFE_INTEGER, `${name} is too large.`),
    );
}

/**
 * Query-string pagination fields. Spread into a larger query schema with
 * `z.object({ ...paginationShape, ...otherFields })`.
 */
export const paginationShape = {
  page: positiveIntegerParam("page").default(DEFAULT_PAGE),
  limit: positiveIntegerParam("limit")
    .pipe(z.number().max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}.`))
    .default(DEFAULT_LIMIT),
};

export const paginationQuerySchema = z.object(paginationShape);

export interface Pagination {
  page: number;
  limit: number;
  /** Rows to skip: (page - 1) * limit. */
  offset: number;
  /** Inclusive bounds for Supabase `.range(from, to)`. */
  from: number;
  to: number;
}

export function toPagination({ page, limit }: { page: number; limit: number }): Pagination {
  const offset = (page - 1) * limit;
  return { page, limit, offset, from: offset, to: offset + limit - 1 };
}

/** Reads `page` and `limit` from the query string, applying defaults and limits. */
export function getPagination(searchParams: URLSearchParams): Pagination {
  return toPagination(parseQuery(searchParams, paginationQuerySchema));
}
