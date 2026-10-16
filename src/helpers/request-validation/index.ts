import 'server-only';
import { z } from 'zod';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '@/constants/api';
import { badRequest, invalidJson, validationError } from '@/helpers/api-error';
import type { Pagination, ValidationIssue } from '@/types/api';

/**
 * REQUEST VALIDATION HELPERS. EACH ONE RETURNS TYPED, VALIDATED DATA OR
 * THROWS AN `ApiError` THAT `apiRoute` TURNS INTO A SAFE RESPONSE.
 *
 * STATUS CODES: INVALID JSON → 400; JSON THAT FAILS THE SCHEMA → 422;
 * INVALID ROUTE PARAMS OR QUERY STRING → 400. ALL VALIDATION FAILURES USE
 * CODE `VALIDATION_ERROR` AND LIST ISSUES BY PATH, NEVER ECHOING VALUES.
 */

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
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

/** PARSES AND VALIDATES A JSON REQUEST BODY. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  const contentType = request.headers.get('content-type')?.trim() ?? '';
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw badRequest('The request body must be sent as application/json.');
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
 * VALIDATES DYNAMIC ROUTE PARAMS. ACCEPTS THE `params` PROMISE Next.js PASSES
 * TO ROUTE HANDLERS, OR AN ALREADY-RESOLVED OBJECT.
 */
export async function parseParams<T extends z.ZodType>(
  params: unknown,
  schema: T,
): Promise<z.output<T>> {
  return parseOrThrow(schema, await params, 400);
}

/**
 * VALIDATES QUERY-STRING PARAMETERS. REPEATED KEYS BECOME ARRAYS, SO A
 * SCHEMA EXPECTING A SINGLE STRING REJECTS `?page=1&page=2`.
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

/** A UUID route/query/body VALUE (ANY RFC 9562 VERSION). */
export const uuidSchema = z.uuid({ message: 'Must be a valid UUID.' });

/** ROUTE PARAMS OF EVERY `/{id}` ENDPOINT. */
export const idParamsSchema = z.object({ id: uuidSchema });

/** VALIDATES A SINGLE UUID OUTSIDE A SCHEMA, E.G. INSIDE AN AUTHORIZATION GUARD. */
export function assertUuid(value: unknown, path: string): string {
  return parseOrThrow(z.object({ [path]: uuidSchema }), { [path]: value }, 400)[path];
}

// --- PAGINATION --------------------------------------------------------------

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
 * QUERY-STRING PAGINATION FIELDS. SPREAD INTO A LARGER QUERY SCHEMA WITH
 * `z.object({ ...paginationShape, ...otherFields })`.
 */
export const paginationShape = {
  page: positiveIntegerParam('page').default(DEFAULT_PAGE),
  limit: positiveIntegerParam('limit')
    .pipe(z.number().max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}.`))
    .default(DEFAULT_LIMIT),
};

const paginationQuerySchema = z.object(paginationShape);

export function toPagination({ page, limit }: { page: number; limit: number }): Pagination {
  const offset = (page - 1) * limit;
  return { page, limit, offset, from: offset, to: offset + limit - 1 };
}

/** READS `page` AND `limit` FROM THE QUERY STRING, APPLYING DEFAULTS AND LIMITS. */
export function getPagination(searchParams: URLSearchParams): Pagination {
  return toPagination(parseQuery(searchParams, paginationQuerySchema));
}
