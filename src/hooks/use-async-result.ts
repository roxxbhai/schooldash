'use client';

import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { ApiResult } from '@/types/api-client';

interface LoadedResult<T> {
  key: string;
  result: ApiResult<T>;
}

/**
 * RUNS `load` WHENEVER `key` CHANGES (OR ON `reload()`), AND KEEPS ONLY THE
 * ANSWER FOR THE LATEST KEY: AN EARLIER, SLOWER RESPONSE CAN NEVER OVERWRITE A
 * NEWER ONE. A `null` KEY WAITS (E.G. UNTIL A REQUIRED FILTER IS CHOSEN).
 * THE PREVIOUS DATA STAYS VISIBLE WHILE THE NEXT LOAD RUNS.
 */
export function useAsyncResult<T>(key: string | null, load: (signal: AbortSignal) => Promise<ApiResult<T>>) {
  const [loaded, setLoaded] = useState<LoadedResult<T> | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // ALWAYS CALLS THE LATEST `load`, WITHOUT RE-RUNNING THE EFFECT FOR EVERY NEW FUNCTION IDENTITY.
  const runLoad = useEffectEvent(function runLoad(signal: AbortSignal) {
    return load(signal);
  });

  const requestKey = key === null ? null : `${key}|${reloadCount}`;

  const reload = useCallback(function reload() {
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    if (requestKey === null) return;
    const controller = new AbortController();
    runLoad(controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoaded({ key: requestKey, result });
    });
    return () => controller.abort();
  }, [requestKey]);

  const result = loaded?.result;
  return {
    data: result?.success ? result.data : null,
    errorMessage: result && !result.success ? result.message : null,
    /** TRUE UNTIL THE CURRENT REQUEST HAS ANSWERED. */
    isLoading: requestKey !== null && loaded?.key !== requestKey,
    /** TRUE ONLY BEFORE THE FIRST ANSWER, WHEN THERE IS NOTHING TO SHOW YET. */
    isInitialLoading: requestKey !== null && !loaded,
    reload,
  };
}
