import type { Enums } from '@/types/database';
import type { StatusTone } from '@/components/status-badge';

export type AttendanceStatus = Enums<'attendanceStatus'>;

/** WHAT THE REGISTER SHOWS FOR ONE PERSON: THE CHOSEN STATUS (NULL = NOT MARKED) AND THE NOTE. */
export interface AttendanceDraft {
  status: AttendanceStatus | null;
  remarks: string;
}

/** SAVED: RECORDED AND UNCHANGED. NOT-MARKED: NO RECORD AND NO CHOICE. CHANGED: AN UNSAVED CHOICE OR CORRECTION. */
export type AttendanceRowState = 'saved' | 'not-marked' | 'changed';

export type AttendanceCounts = Record<AttendanceStatus | 'notMarked', number>;

/** THE FIELDS OF A STUDENT OR TEACHER ATTENDANCE RECORD THE REGISTER NEEDS. */
export interface AttendanceRecordFields {
  id: string;
  status: AttendanceStatus;
  remarks: string | null;
  updatedAt: string;
}

export interface AttendanceStatusOption {
  value: AttendanceStatus;
  label: string;
  tone: StatusTone;
}

/** ONE ROW OF A REGISTER, READY TO RENDER. `id` IS THE STUDENT OR TEACHER ID. */
export interface AttendanceRegisterRow {
  id: string;
  /** E.G. THE ROLL NUMBER; NULL WHEN THE REGISTER HAS NO LEADING COLUMN OR THE VALUE IS MISSING. */
  leading: string | null;
  name: string;
  code: string;
  record: AttendanceRecordFields | null;
  draft: AttendanceDraft;
  state: AttendanceRowState;
  errorMessage: string | null;
  /** WHY THE ROW CANNOT BE EDITED (E.G. A DEACTIVATED ACCOUNT); NULL WHEN IT CAN. */
  lockedReason: string | null;
}

/**
 * THE UNSAVED WORK FOR ONE REGISTER (ONE CLASS AND DATE, OR ONE DATE). KEYED SO
 * THAT CHOOSING ANOTHER CLASS OR DATE STARTS FRESH WITHOUT AN EFFECT.
 */
export interface AttendanceSession<TRecord extends AttendanceRecordFields> {
  key: string;
  edits: Record<string, AttendanceDraft>;
  errors: Record<string, string>;
  /** RECORDS THE SERVER RETURNED FROM THE LAST SAVE, SHOWN UNTIL A NEWER LOAD ARRIVES. */
  saved: Record<string, TRecord>;
  formError: string | null;
}

/** A ROW WITH NO RECORD YET AND A CHOSEN STATUS: SAVING CREATES IT. */
export type NewAttendanceRow = AttendanceRegisterRow & { record: null; draft: { status: AttendanceStatus; remarks: string } };

/** A ROW WHOSE RECORD WAS EDITED: SAVING CORRECTS IT. */
export type CorrectedAttendanceRow = AttendanceRegisterRow & { record: AttendanceRecordFields };
