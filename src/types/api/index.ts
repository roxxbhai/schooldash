export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'ACCOUNT_NOT_PROVISIONED'
  | 'ACCOUNT_INACTIVE'
  | 'CSRF_REJECTED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

/** FIELD-LEVEL VALIDATION FEEDBACK. NEVER CONTAINS SUBMITTED VALUES. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiSuccessBody<T> {
  data: T;
  error: null;
}

export interface ApiFailureBody {
  data: null;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: readonly ValidationIssue[];
  };
}

export interface Pagination {
  page: number;
  limit: number;
  /** ROWS TO SKIP: (PAGE - 1) * LIMIT. */
  offset: number;
  /** INCLUSIVE BOUNDS FOR SUPABASE `.range(from, to)`. */
  from: number;
  to: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedList<T> {
  items: T[];
  pagination: PaginationMeta;
}
