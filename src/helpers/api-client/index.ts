import { ERROR_MESSAGES, NETWORK_ERROR_MESSAGE } from '@/constants/api-client';
import type { ApiFailureData, ApiResult, FieldErrors, QueryParams } from '@/types/api-client';
import type { ApiErrorCode, ApiFailureBody, ApiSuccessBody } from '@/types/api';

/** "/api/students" + { classId, page: 2, search: undefined } → "/api/students?classId=…&page=2". EMPTY VALUES ARE DROPPED. */
export function buildApiUrl(path: string, query?: QueryParams): string {
  if (!query) return path;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/** THE MESSAGE TO SHOW A PERSON: A PLAIN-LANGUAGE ONE FOR GENERIC CODES, OTHERWISE THE SERVER'S SPECIFIC, CLIENT-SAFE TEXT. */
export function toUserMessage(code: ApiErrorCode, serverMessage: string | undefined): string {
  return ERROR_MESSAGES[code] ?? serverMessage ?? ERROR_MESSAGES.INTERNAL_ERROR ?? 'Something went wrong.';
}

/** VALIDATION DETAILS AS { field: message }, KEEPING THE FIRST MESSAGE PER FIELD. */
export function toFieldErrors(failure: ApiFailureData): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of failure.details) {
    if (!errors[issue.path]) errors[issue.path] = issue.message;
  }
  return errors;
}

export function apiFailure(data: ApiFailureData, message: string): ApiResult<never> {
  return { success: false, message, data };
}

/** THE { data, error } ENVELOPE, OR NULL FOR AN EMPTY, NON-JSON OR MALFORMED BODY (E.G. A PROXY ERROR PAGE). */
export async function readEnvelope<T>(response: Response): Promise<ApiSuccessBody<T> | ApiFailureBody | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('data' in body) || !('error' in body)) return null;
    return body as ApiSuccessBody<T> | ApiFailureBody;
  } catch {
    return null;
  }
}

/** THE RESULT FOR A CALL THAT NEVER GOT AN ANSWER (OFFLINE, DNS, CONNECTION RESET). */
export function networkFailure(): ApiResult<never> {
  return apiFailure({ status: 0, code: 'NETWORK_ERROR', details: [] }, NETWORK_ERROR_MESSAGE);
}

/**
 * THE API ACCEPTS SEARCH TERMS OF LETTERS (WITH THEIR COMBINING MARKS, E.G. DEVANAGARI
 * VOWEL SIGNS), NUMBERS, SPACES, '.', '_' AND '-' (≤ 50); ANYTHING ELSE IS DROPPED BEFORE QUERYING.
 */
export function toSearchTerm(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').trim().slice(0, 50);
}
