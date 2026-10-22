import { create } from 'zustand';
import type { PortalSessionStore } from '@/types/portal-session';

/**
 * WHO THE SIGNED-IN TEACHER OR STUDENT IS, FOR FILTERS AND LABELS ("MY PERIODS",
 * "MY ATTENDANCE"). NEVER PROOF OF ANYTHING: EVERY API ROUTE AND RLS CHECK THE SESSION ON THEIR OWN.
 */
export const portalSessionStore = create<PortalSessionStore>((set) => ({
  recordId: null,

  setRecordId: (recordId) => set({ recordId }),
}));
