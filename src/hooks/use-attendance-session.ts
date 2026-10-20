'use client';

import { useState } from 'react';
import { emptyAttendanceSession, sessionForKey } from '@/helpers/admin-attendance';
import { withoutKey } from '@/helpers/forms';
import type { AttendanceRecordFields, AttendanceRegisterRow, AttendanceSession, AttendanceStatus } from '@/types/admin-attendance';

interface SaveOutcome<TRecord extends AttendanceRecordFields> {
  /** RECORDS THE SERVER CONFIRMED, BY STUDENT OR TEACHER ID. */
  saved: Record<string, TRecord>;
  /** PER-ROW FAILURES, BY STUDENT OR TEACHER ID. */
  errors: Record<string, string>;
  formError: string | null;
}

/**
 * THE UNSAVED EDITS, ROW ERRORS AND JUST-SAVED RECORDS OF ONE REGISTER. THE STATE IS
 * KEYED BY `registerKey` (CLASS|DATE OR DATE), SO CHOOSING ANOTHER REGISTER STARTS
 * CLEAN WITHOUT AN EFFECT. A `null` KEY (NOTHING CHOSEN) IGNORES EDITS.
 */
export function useAttendanceSession<TRecord extends AttendanceRecordFields>(registerKey: string | null) {
  const [stored, setStored] = useState<AttendanceSession<TRecord>>(() => emptyAttendanceSession<TRecord>(''));

  const session = sessionForKey(stored, registerKey ?? '');

  function update(key: string | null, change: (current: AttendanceSession<TRecord>) => AttendanceSession<TRecord>) {
    if (key === null) return;
    setStored((current) => change(sessionForKey(current, key)));
  }

  function setStatus(row: AttendanceRegisterRow, status: AttendanceStatus) {
    update(registerKey, (current) => ({
      ...current,
      edits: { ...current.edits, [row.id]: { ...row.draft, status } },
      errors: withoutKey(current.errors, row.id),
    }));
  }

  function setRemarks(row: AttendanceRegisterRow, remarks: string) {
    update(registerKey, (current) => ({
      ...current,
      edits: { ...current.edits, [row.id]: { ...row.draft, remarks } },
      errors: withoutKey(current.errors, row.id),
    }));
  }

  /** EVERY EDITABLE ROW WITHOUT A STATUS BECOMES PRESENT; NOTES ARE KEPT. */
  function markRemainingPresent(rows: readonly AttendanceRegisterRow[]) {
    update(registerKey, (current) => {
      const edits = { ...current.edits };
      for (const row of rows) {
        if (!row.lockedReason && row.draft.status === null) edits[row.id] = { ...row.draft, status: 'present' };
      }
      return { ...current, edits };
    });
  }

  function reset() {
    update(registerKey, (current) => ({ ...current, edits: {}, errors: {}, formError: null }));
  }

  /** CLEARS THE EDITS OF CONFIRMED ROWS (THEY NOW SHOW THE SAVED RECORD) AND KEEPS FAILED ONES FOR ANOTHER TRY. */
  function applySaveOutcome(key: string, outcome: SaveOutcome<TRecord>) {
    update(key, (current) => {
      const edits = { ...current.edits };
      for (const id of Object.keys(outcome.saved)) delete edits[id];
      return { ...current, edits, errors: outcome.errors, saved: { ...current.saved, ...outcome.saved }, formError: outcome.formError };
    });
  }

  return { session, setStatus, setRemarks, markRemainingPresent, reset, applySaveOutcome };
}
