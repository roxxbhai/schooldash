import type { AcademicYear } from '@/types/academic-years';
import type { SchoolClass } from '@/types/classes';
import type { Subject } from '@/types/subjects';
import type { Teacher } from '@/types/teachers';

export interface ReferenceData {
  academicYears: AcademicYear[];
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Teacher[];
}

/** `refreshing`: RELOADING IN THE BACKGROUND WHILE THE PREVIOUS LISTS STAY USABLE. */
export type ReferenceDataStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export interface ReferenceDataStore extends ReferenceData {
  status: ReferenceDataStatus;
  errorMessage: string | null;

  setReferenceData: (data: ReferenceData) => void;
  setStatus: (status: ReferenceDataStatus) => void;
  setErrorMessage: (errorMessage: string | null) => void;
}
