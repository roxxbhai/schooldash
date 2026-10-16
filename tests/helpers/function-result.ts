import type { FunctionFailure, FunctionSuccess } from '@/types/function-result';

/** A SUCCESSFUL STANDARD RESULT, FOR MOCKING src/functions IN UNIT TESTS. */
export function okResult<T>(data: T): FunctionSuccess<T> {
  return { success: true, message: 'Operation successful', data };
}

/** A NOT-FOUND FAILURE RESULT, AS A LOOKUP IN src/functions REPORTS A MISSING ROW. */
export function notFoundResult(message = 'Not found.'): FunctionFailure {
  return { success: false, message, data: { status: 404, code: 'NOT_FOUND' } };
}
