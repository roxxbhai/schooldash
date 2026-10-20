import type { Enrollment } from '@/types/enrollments';
import type { Result } from '@/types/results';
import type { Student } from '@/types/students';

/** ONE ROW OF A MARKS SHEET: A STUDENT ON THE CLASS ROSTER AND THEIR SAVED MARK FOR THE PAPER, IF ANY. */
export interface MarksSheetRow {
  enrollment: Enrollment;
  /** NULL ONLY IF THE STUDENT COULDN'T BE LOADED. */
  student: Student | null;
  result: Result | null;
}

/** THE SHEET OF ONE PAPER, TAGGED WITH IT SO A SHEET STILL SHOWING WHILE ANOTHER PAPER LOADS IS NEVER EDITED OR SAVED. */
export interface MarksSheet {
  paperId: string;
  rows: MarksSheetRow[];
}

/** WHAT THE PERSON HAS TYPED FOR ONE STUDENT, BEFORE SAVING. */
export interface MarkDraft {
  marks: string;
  remarks: string;
}

/** A MARK NOT ENTERED BEFORE: SENT IN THE ONE BULK REQUEST. */
export interface NewMark {
  studentId: string;
  marksObtained: number;
  remarks: string | null;
}

/** A CORRECTION TO A SAVED MARK: ONLY THE FIELDS THAT CHANGED, FROM THE VERSION LAST READ. */
export interface MarkCorrection {
  studentId: string;
  result: Result;
  marksObtained?: number;
  remarks?: string | null;
}

/** THE OUTCOME OF ONE SAVE: WHAT THE SERVER CONFIRMED, AND WHY ANYTHING ELSE WAS NOT SAVED. */
export interface MarksSaveOutcome {
  saved: Result[];
  /** STUDENT ID → WHY THAT ROW WAS NOT SAVED. */
  rowErrors: Record<string, string>;
  /** STUDENTS WHOSE MARK WAS CHANGED BY SOMEONE ELSE (THEIR DRAFT IS DROPPED SO THE LATEST SHOWS). */
  conflictedStudentIds: string[];
  /** A FAILURE THAT ISN'T TIED TO ONE ROW. */
  formError: string | null;
}
