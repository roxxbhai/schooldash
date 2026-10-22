'use client';

import { useEffect } from 'react';
import { portalSessionStore } from '@/zustand/portal-session';

/** HANDS THE RECORD ID THE SERVER RESOLVED TO THE BROWSER STORE. RENDERS NOTHING. */
export function PortalSessionSync({ recordId }: { recordId: string | null }) {
  const setRecordId = portalSessionStore((state) => state.setRecordId);

  useEffect(() => {
    setRecordId(recordId);
  }, [setRecordId, recordId]);

  return null;
}
