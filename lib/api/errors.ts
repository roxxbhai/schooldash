import "server-only";

/**
 * Known, safe-to-expose API errors. Anything thrown that is not an `ApiError`
 * is treated as unexpected and surfaced to clients as a generic 500.
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "ACCOUNT_NOT_PROVISIONED"
  | "ACCOUNT_INACTIVE"
  | "CSRF_REJECTED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

/** Field-level validation feedback. Never contains submitted values. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly code: ApiErrorCode;
  readonly details?: readonly ValidationIssue[];

  constructor(
    status: ApiErrorStatus,
    code: ApiErrorCode,
    message: string,
    details?: readonly ValidationIssue[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = "The request is malformed.") =>
  new ApiError(400, "BAD_REQUEST", message);

export const invalidJson = () =>
  new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");

/** 422 for JSON bodies that parse but fail validation; 400 for params/query. */
export const validationError = (
  details: readonly ValidationIssue[],
  status: 400 | 422 = 422,
) => new ApiError(status, "VALIDATION_ERROR", "The request failed validation.", details);

export const unauthorized = () =>
  new ApiError(401, "UNAUTHORIZED", "Authentication is required.");

export const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");

export const forbidden = (message = "You do not have permission to perform this action.") =>
  new ApiError(403, "FORBIDDEN", message);

export const accountNotProvisioned = () =>
  new ApiError(
    403,
    "ACCOUNT_NOT_PROVISIONED",
    "This account has not been set up for the school dashboard.",
  );

export const accountInactive = () =>
  new ApiError(403, "ACCOUNT_INACTIVE", "This account has been deactivated.");

export const csrfRejected = () =>
  new ApiError(403, "CSRF_REJECTED", "Cross-site requests are not allowed.");

export const notFound = (message = "The requested resource was not found.") =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message = "The resource conflicts with an existing one.") =>
  new ApiError(409, "CONFLICT", message);

export const rateLimited = () =>
  new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");

export const internalError = () =>
  new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");

export const serviceUnavailable = () =>
  new ApiError(
    503,
    "SERVICE_UNAVAILABLE",
    "A required service is temporarily unavailable.",
  );
