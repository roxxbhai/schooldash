import type { ApiErrorCode, ValidationIssue } from '@/types/api';

/** BROWSER-SIDE FAILURES THAT NEVER REACH THE SERVER (OR GET NO USABLE ANSWER). */
export type ClientErrorCode = 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'ABORTED';

export interface ApiFailureData {
  /** HTTP STATUS; 0 WHEN THE SERVER WAS NOT REACHED. */
  status: number;
  code: ApiErrorCode | ClientErrorCode;
  details: readonly ValidationIssue[];
}

/** THE STANDARD { success, message, data } RESULT (AGENTS.MD) FOR EVERY CLIENT API CALL. */
export type ApiResult<T> =
  | { success: true; message: string; data: T }
  | { success: false; message: string; data: ApiFailureData };

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  /** FALSE FOR SIGN-IN AND SETUP, WHERE A 401 IS AN ANSWER RATHER THAN AN EXPIRED SESSION. */
  isSessionRequired?: boolean;
}

/** FIELD PATH → FIRST MESSAGE FOR THAT FIELD, FOR INLINE FORM ERRORS. */
export type FieldErrors = Record<string, string>;
