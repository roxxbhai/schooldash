'use client';

import { useEffect } from 'react';
import { portalSessionStore } from '@/zustand/portal-session';

interface PortalSessionSyncProps {
  recordId: string | null;
  fullName: string;
}

/** HANDS WHAT THE SERVER RESOLVED (RECORD ID, NAME) TO THE BROWSER STORE. RENDERS NOTHING. */
export function PortalSessionSync({ recordId, fullName }: PortalSessionSyncProps) {
  const setRecordId = portalSessionStore((state) => state.setRecordId);
  const setFullName = portalSessionStore((state) => state.setFullName);

  useEffect(() => {
    setRecordId(recordId);
    setFullName(fullName);
  }, [setRecordId, setFullName, recordId, fullName]);

  return null;
}
