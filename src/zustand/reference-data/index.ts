import { create } from 'zustand';
import type { ReferenceDataStore } from '@/types/reference-data';

/**
 * SMALL, SLOW-CHANGING LISTS THE WHOLE PORTAL NEEDS TO TURN IDS INTO NAMES:
 * ACADEMIC YEARS, CLASSES, SUBJECTS AND TEACHERS. FILLED BY useReferenceData();
 * A SIGN-OUT RELOADS THE PAGE, WHICH CLEARS IT.
 */
export const referenceDataStore = create<ReferenceDataStore>((set) => ({
  academicYears: [],
  classes: [],
  subjects: [],
  teachers: [],
  status: 'idle',
  errorMessage: null,

  setReferenceData: (data) => set(data),
  setStatus: (status) => set({ status }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
