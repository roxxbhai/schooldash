'use client';

import { useEffect, useState } from 'react';

/** THE VALUE, ONCE IT HAS STOPPED CHANGING FOR `delayMs` (E.G. A SEARCH BOX, SO EACH KEYSTROKE ISN'T A REQUEST). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
