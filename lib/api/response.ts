import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { EnvValidationError } from "@/lib/env";
import { ApiError, internalError, serviceUnavailable } from "@/lib/api/errors";
import type { ApiErrorCode, ValidationIssue } from "@/lib/api/errors";
import { logServerError } from "@/lib/api/log";

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiFailure {
  data: null;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: readonly ValidationIssue[];
  };
}

export type ApiBody<T> = ApiSuccess<T> | ApiFailure;

/**
 * API responses can carry per-user data and Supabase auth cookies, so they
 * must never be stored by browsers, CDNs or proxies. These match the headers
 * @supabase/ssr requires on responses that set auth cookies.
 */
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function ok<T>(data: T, status: 200 | 201 = 200): Response {
  const body: ApiSuccess<T> = { data, error: null };
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

export function created<T>(data: T): Response {
  return ok(data, 201);
}

export function errorResponse(error: ApiError): Response {
  const body: ApiFailure = {
    data: null,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: NO_STORE_HEADERS });
}

/**
 * Converts anything thrown by a handler into a safe response. Known
 * `ApiError`s pass through; missing configuration becomes 503; everything
 * else is logged (metadata only) and becomes a generic 500.
 */
export function toErrorResponse(error: unknown, event = "api.unhandled"): Response {
  if (error instanceof ApiError) {
    if (error.status >= 500) logServerError(event, error);
    return errorResponse(error);
  }

  if (error instanceof EnvValidationError) {
    logServerError("config.missing", error, { variables: error.variables });
    return errorResponse(serviceUnavailable());
  }

  if (isUnavailable(error)) {
    logServerError(event, error);
    return errorResponse(serviceUnavailable());
  }

  logServerError(event, error);
  return errorResponse(internalError());
}

/** Lets data-access errors flag themselves as upstream-unavailable (503). */
function isUnavailable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { unavailable?: unknown }).unavailable === true
  );
}

/**
 * Wraps a Route Handler with request-time execution and centralized error
 * conversion.
 *
 * `connection()` runs first so that, with Cache Components enabled, a GET
 * handler is never prerendered at build time (where it could otherwise bake
 * in e.g. a "not configured" 503 response). It sits outside the `try` because
 * during prerendering it throws an internal Next.js signal that must not be
 * caught; `unstable_rethrow` covers any other such signal from the handler.
 */
export function apiRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    await connection();
    try {
      return await handler(...args);
    } catch (error) {
      unstable_rethrow(error);
      return toErrorResponse(error);
    }
  };
}
