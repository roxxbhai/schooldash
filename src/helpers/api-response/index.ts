import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { NO_STORE_HEADERS } from '@/constants/api';
import { toApiError } from '@/helpers/api-error';
import type { ApiError } from '@/helpers/api-error';
import type { ApiFailureBody, ApiSuccessBody, PaginatedList } from '@/types/api';

/** THE ONE RESPONSE FORMAT OF THE API: `{ data, error }`. */

export function ok<T>(data: T, status: 200 | 201 = 200): Response {
  const body: ApiSuccessBody<T> = { data, error: null };
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

export function created<T>(data: T): Response {
  return ok(data, 201);
}

/** COLLECTION RESPONSE: `{ data: { items, pagination }, error: null }`. */
export function paginated<T>(list: PaginatedList<T>): Response {
  return ok({ items: list.items, pagination: list.pagination });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiFailureBody = {
    data: null,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: NO_STORE_HEADERS });
}

/** CONVERTS ANYTHING THROWN BY A HANDLER INTO A SAFE ERROR RESPONSE. */
export function toErrorResponse(error: unknown, event = 'api.unhandled'): Response {
  return errorResponse(toApiError(error, event));
}

/**
 * WRAPS A ROUTE HANDLER WITH REQUEST-TIME EXECUTION AND THE SINGLE, CENTRAL
 * TRY-CATCH THAT TURNS ERRORS INTO `{ data: null, error }` RESPONSES.
 *
 * `connection()` RUNS FIRST SO THAT, WITH CACHE COMPONENTS ENABLED, A GET
 * HANDLER IS NEVER PRERENDERED AT BUILD TIME (WHERE IT COULD BAKE IN, E.G., A
 * "NOT CONFIGURED" 503). IT SITS OUTSIDE THE `try` BECAUSE DURING PRERENDERING
 * IT THROWS AN INTERNAL NEXT.JS SIGNAL THAT MUST NOT BE CAUGHT;
 * `unstable_rethrow` COVERS ANY OTHER SUCH SIGNAL FROM THE HANDLER.
 */
export function apiRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async function handleApiRequest(...args: Args): Promise<Response> {
    await connection();
    try {
      return await handler(...args);
    } catch (error) {
      unstable_rethrow(error);
      return toErrorResponse(error);
    }
  };
}
