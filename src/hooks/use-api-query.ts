'use client';

import { apiRequest } from '@/functions/api-client';
import { useAsyncResult } from '@/hooks/use-async-result';
import type { QueryParams } from '@/types/api-client';

/**
 * LOADS A GET ENDPOINT, RELOADING WHEN THE PATH OR QUERY CHANGES OR ON `reload()`.
 * STALE RESPONSES ARE DISCARDED (SEE useAsyncResult). PASS `null` AS THE PATH TO WAIT.
 */
export function useApiQuery<T>(path: string | null, query?: QueryParams) {
  const queryKey = JSON.stringify(query ?? {});

  function load(signal: AbortSignal) {
    return apiRequest<T>(path ?? '', { query, signal });
  }

  return useAsyncResult<T>(path === null ? null : `${path}|${queryKey}`, load);
}
