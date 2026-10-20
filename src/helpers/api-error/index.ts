import 'server-only';
import { EnvValidationError } from '@/configs';
import { INTERNAL_ERROR_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE } from '@/constants/api';
import { logServerError } from '@/helpers/logger';
import type { ApiErrorCode, ApiErrorStatus, ValidationIssue } from '@/types/api';

/**
 * KNOWN, SAFE-TO-EXPOSE API ERRORS. ANYTHING THROWN THAT IS NOT AN `ApiError`
 * IS UNEXPECTED AND REACHES CLIENTS ONLY AS A GENERIC 500 (OR 503).
 */
export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly code: ApiErrorCode;
  readonly details?: readonly ValidationIssue[];
  /** TRUE WHEN THE FAILURE WAS ALREADY LOGGED WHERE IT HAPPENED. */
  readonly isReported: boolean;

  constructor(
    status: ApiErrorStatus,
    code: ApiErrorCode,
    message: string,
    details?: readonly ValidationIssue[],
    isReported = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isReported = isReported;
  }
}

/** A FAILED QUERY. `isUnavailable` MARKS NETWORK-LEVEL FAILURES (→ 503). */
export class DataAccessError extends Error {
  readonly operation: string;
  readonly code?: string;
  readonly isUnavailable: boolean;

  constructor(operation: string, code?: string) {
    super(`Data access failed: ${operation}`);
    this.name = 'DataAccessError';
    this.operation = operation;
    this.code = code || undefined;
    // POSTGREST ERRORS ALWAYS CARRY A CODE; SUPABASE-JS REPORTS FETCH FAILURES
    // (SUPABASE UNREACHABLE) WITH AN EMPTY ONE.
    this.isUnavailable = !code;
  }
}

export function badRequest(message = 'The request is malformed.') {
  return new ApiError(400, 'BAD_REQUEST', message);
}

export function invalidJson() {
  return new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
}

/** 422 FOR JSON BODIES THAT PARSE BUT FAIL VALIDATION; 400 FOR PARAMS/QUERY. */
export function validationError(details: readonly ValidationIssue[], status: 400 | 422 = 422) {
  return new ApiError(status, 'VALIDATION_ERROR', 'The request failed validation.', details);
}

export function unauthorized() {
  return new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
}

export function invalidCredentials() {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
}

/** ONE MESSAGE FOR AN UNKNOWN EMAIL, A WRONG, USED OR EXPIRED CODE, SO NOTHING IS REVEALED. */
export function invalidSetupCode() {
  return new ApiError(401, 'INVALID_SETUP_CODE', 'The email or setup code is incorrect, or the code has expired.');
}

export function forbidden(message = 'You do not have permission to perform this action.') {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function accountNotProvisioned() {
  return new ApiError(403, 'ACCOUNT_NOT_PROVISIONED', 'This account has not been set up for the school dashboard.');
}

export function accountInactive() {
  return new ApiError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated.');
}

export function csrfRejected() {
  return new ApiError(403, 'CSRF_REJECTED', 'Cross-site requests are not allowed.');
}

export function notFound(message = 'The requested resource was not found.') {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function conflict(message = 'The resource conflicts with an existing one.') {
  return new ApiError(409, 'CONFLICT', message);
}

export function rateLimited() {
  return new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
}

export function internalError() {
  return new ApiError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
}

export function serviceUnavailable() {
  return new ApiError(503, 'SERVICE_UNAVAILABLE', SERVICE_UNAVAILABLE_MESSAGE);
}

/**
 * CLASSIFIES ANYTHING THROWN INTO A CLIENT-SAFE `ApiError`, LOGGING (METADATA
 * ONLY) WHAT THE CLIENT WILL NOT SEE:
 *   - `ApiError`: PASSES THROUGH; 5XX ONES ARE LOGGED UNLESS ALREADY REPORTED;
 *   - MISSING CONFIGURATION AND UNREACHABLE SERVICES: 503;
 *   - ANYTHING ELSE: GENERIC 500.
 */
export function toApiError(error: unknown, event = 'api.unhandled'): ApiError {
  if (error instanceof ApiError) {
    if (error.status >= 500 && !error.isReported) logServerError(event, error);
    return error;
  }
  if (error instanceof EnvValidationError) {
    logServerError('config.missing', error, { variables: error.variables });
    return serviceUnavailable();
  }
  logServerError(event, error);
  if (error instanceof DataAccessError && error.isUnavailable) return serviceUnavailable();
  return internalError();
}
