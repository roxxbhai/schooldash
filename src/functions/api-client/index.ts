import 'client-only';
import { MAX_PAGE_SIZE } from '@/constants/api-client';
import { SIGN_IN_REASONS } from '@/constants/routes';
import { apiFailure, buildApiUrl, networkFailure, readEnvelope, toUserMessage } from '@/helpers/api-client';
import { signInPathFor } from '@/helpers/routes';
import type { PaginatedList } from '@/types/api';
import type { ApiRequestOptions, ApiResult, QueryParams } from '@/types/api-client';

/**
 * THE ONE WAY BROWSER CODE TALKS TO THE BACKEND.
 *
 * - SAME-ORIGIN fetch: THE SUPABASE SESSION COOKIES TRAVEL AUTOMATICALLY, AND
 *   THE BROWSER SENDS THE `Origin` HEADER THE CSRF CHECK REQUIRES.
 * - NEVER THROWS: EVERY OUTCOME IS A { success, message, data } RESULT. A
 *   FAILURE'S `data` CARRIES THE HTTP STATUS, ERROR CODE AND FIELD DETAILS.
 * - AN EXPIRED SESSION (401 UNAUTHORIZED) SENDS THE PERSON TO THEIR PORTAL'S SIGN-IN.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResult<T>> {
  try {
    const hasBody = options.body !== undefined;
    const response = await fetch(buildApiUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const envelope = await readEnvelope<T>(response);

    if (!envelope) {
      return apiFailure({ status: response.status, code: 'INVALID_RESPONSE', details: [] }, toUserMessage('INTERNAL_ERROR', undefined));
    }
    if (response.ok && envelope.error === null) {
      return { success: true, message: 'Operation successful', data: envelope.data };
    }

    const error = envelope.error ?? { code: 'INTERNAL_ERROR' as const, message: undefined, details: undefined };
    if (error.code === 'UNAUTHORIZED' && options.isSessionRequired !== false) {
      // A FULL PAGE LOAD (NOT A CLIENT NAVIGATION) DELIBERATELY DISCARDS ALL IN-MEMORY STATE OF THE ENDED SESSION.
      window.location.replace(`${signInPathFor(window.location.pathname)}?reason=${SIGN_IN_REASONS.sessionExpired}`);
    }
    return apiFailure({ status: response.status, code: error.code, details: error.details ?? [] }, toUserMessage(error.code, error.message));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return apiFailure({ status: 0, code: 'ABORTED', details: [] }, 'The request was cancelled.');
    }
    return networkFailure();
  }
}

/** UPPER BOUND FOR fetchAllPages: 20 PAGES OF 100. REFERENCE LISTS ARE FAR SMALLER; THIS ONLY STOPS A RUNAWAY LOOP. */
const MAX_PAGES = 20;

/**
 * EVERY ROW OF A SMALL COLLECTION (CLASSES, SUBJECTS …), 100 PER REQUEST. USE
 * ONLY FOR BOUNDED REFERENCE LISTS, NEVER FOR STUDENTS, ATTENDANCE OR RESULTS.
 */
export async function fetchAllPages<T>(path: string, query: QueryParams = {}): Promise<ApiResult<T[]>> {
  try {
    const items: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await apiRequest<PaginatedList<T>>(path, { query: { ...query, page, limit: MAX_PAGE_SIZE } });
      if (!result.success) return result;
      items.push(...result.data.items);
      if (page >= result.data.pagination.totalPages) break;
    }
    return { success: true, message: 'Operation successful', data: items };
  } catch {
    return networkFailure();
  }
}

/** HOW MANY ROWS MATCH A FILTER, FROM ONE `limit=1` REQUEST (THE TOTAL IN ITS PAGINATION). */
export async function countRecords(path: string, query: QueryParams = {}): Promise<ApiResult<number>> {
  try {
    const result = await apiRequest<PaginatedList<unknown>>(path, { query: { ...query, page: 1, limit: 1 } });
    if (!result.success) return result;
    return { success: true, message: 'Operation successful', data: result.data.pagination.total };
  } catch {
    return networkFailure();
  }
}

/** POST A NEW RECORD TO A COLLECTION. */
export async function createRecord<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body });
  } catch {
    return networkFailure();
  }
}

/** PATCH ONE RECORD: `${path}/${id}`. */
export async function updateRecord<T>(path: string, id: string, body: unknown): Promise<ApiResult<T>> {
  try {
    return await apiRequest<T>(`${path}/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  } catch {
    return networkFailure();
  }
}

/** DELETE ONE RECORD: `${path}/${id}`. */
export async function deleteRecord<T>(path: string, id: string): Promise<ApiResult<T>> {
  try {
    return await apiRequest<T>(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    return networkFailure();
  }
}

/** A STATE-CHANGING ACTION ON ONE RECORD: `${path}/${id}/${action}` (SET-CURRENT, PUBLISH …). */
export async function runRecordAction<T>(path: string, id: string, action: string, body?: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<ApiResult<T>> {
  try {
    return await apiRequest<T>(`${path}/${encodeURIComponent(id)}/${action}`, { method, body });
  } catch {
    return networkFailure();
  }
}
