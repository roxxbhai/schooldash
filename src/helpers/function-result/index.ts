import 'server-only';
import { ApiError, toApiError } from '@/helpers/api-error';
import type { FunctionFailure, FunctionResult, FunctionSuccess } from '@/types/function-result';

/**
 * BUILDERS FOR THE STANDARD `{ success, message, data }` RESULT RETURNED BY
 * EVERY FUNCTION IN src/functions, AND THE BRIDGE BACK TO THE HTTP LAYER.
 */

export function functionSuccess<T>(data: T, message = 'Operation successful'): FunctionSuccess<T> {
  return { success: true, message, data };
}

/** TURNS ANYTHING CAUGHT INTO A CLIENT-SAFE FAILURE; UNEXPECTED ERRORS ARE LOGGED HERE, ONCE. */
export function functionFailure(error: unknown, event = 'function.failed'): FunctionFailure {
  const apiError = toApiError(error, event);
  return {
    success: false,
    message: apiError.message,
    data: {
      status: apiError.status,
      code: apiError.code,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  };
}

/**
 * THE DATA OF A SUCCESSFUL RESULT. A FAILURE IS RETHROWN AS THE EQUIVALENT
 * `ApiError`, SO A ROUTE (OR ANOTHER FUNCTION) STOPS EXACTLY AS IT WOULD HAVE
 * WITH THE ORIGINAL ERROR, AND THE RESPONSE KEEPS ITS STATUS AND DETAILS.
 */
export function unwrapResult<T>(result: FunctionResult<T>): T {
  if (result.success) return result.data;
  const { status, code, details } = result.data;
  throw new ApiError(status, code, result.message, details, true);
}
