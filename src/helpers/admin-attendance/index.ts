import { toast } from 'sonner';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { pluralize } from '@/helpers/format';
import type {
  AttendanceCounts,
  AttendanceDraft,
  AttendanceRecordFields,
  AttendanceRegisterRow,
  AttendanceRowState,
  AttendanceSession,
  AttendanceStatus,
  CorrectedAttendanceRow,
  NewAttendanceRow,
} from '@/types/admin-attendance';
import type { ValidationIssue } from '@/types/api';
import type { ApiResult } from '@/types/api-client';

/** A REGISTER WITH NO UNSAVED WORK. */
export function emptyAttendanceSession<TRecord extends AttendanceRecordFields>(key: string): AttendanceSession<TRecord> {
  return { key, edits: {}, errors: {}, saved: {}, formError: null };
}

/** THE SESSION FOR `key`: THE STORED ONE IF IT BELONGS TO THIS REGISTER, OTHERWISE A FRESH ONE. */
export function sessionForKey<TRecord extends AttendanceRecordFields>(session: AttendanceSession<TRecord>, key: string): AttendanceSession<TRecord> {
  return session.key === key ? session : emptyAttendanceSession<TRecord>(key);
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  return ATTENDANCE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function draftFromRecord(record: AttendanceRecordFields | null): AttendanceDraft {
  return { status: record?.status ?? null, remarks: record?.remarks ?? '' };
}

/** THE NEWER OF THE LOADED RECORD AND THE ONE RETURNED BY THE LAST SAVE. */
export function latestRecord<TRecord extends AttendanceRecordFields>(loaded: TRecord | undefined, saved: TRecord | undefined): TRecord | null {
  if (!saved) return loaded ?? null;
  if (!loaded) return saved;
  return saved.updatedAt > loaded.updatedAt ? saved : loaded;
}

export function attendanceRowState(record: AttendanceRecordFields | null, draft: AttendanceDraft): AttendanceRowState {
  if (!record) return draft.status ? 'changed' : 'not-marked';
  const isSame = record.status === draft.status && (record.remarks ?? '') === draft.remarks.trim();
  return isSame ? 'saved' : 'changed';
}

export function countAttendance(rows: readonly AttendanceRegisterRow[]): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, late: 0, leave: 0, notMarked: 0 };
  for (const row of rows) {
    if (row.draft.status) counts[row.draft.status] += 1;
    else if (!row.lockedReason) counts.notMarked += 1;
  }
  return counts;
}

/** ROWS WITH NO RECORD YET AND A CHOSEN STATUS: THESE ARE CREATED. */
export function newlyMarkedRows(rows: readonly AttendanceRegisterRow[]): NewAttendanceRow[] {
  return rows.filter((row): row is NewAttendanceRow => !row.lockedReason && !row.record && row.draft.status !== null);
}

/** ROWS WITH A RECORD WHOSE STATUS OR NOTE WAS EDITED: THESE ARE CORRECTED. */
export function correctedRows(rows: readonly AttendanceRegisterRow[]): CorrectedAttendanceRow[] {
  return rows.filter((row): row is CorrectedAttendanceRow => !row.lockedReason && row.record !== null && row.state === 'changed');
}

/** THE `remarks` TO SEND: TRIMMED, OR OMITTED WHEN BLANK. */
export function remarksForCreate(draft: AttendanceDraft): { remarks?: string } {
  const remarks = draft.remarks.trim();
  return remarks ? { remarks } : {};
}

/** ONLY THE FIELDS THAT CHANGED. A CLEARED NOTE IS SENT AS '' (THE API STORES IT AS NULL). */
export function correctionBody(record: AttendanceRecordFields, draft: AttendanceDraft): { status?: AttendanceStatus; remarks?: string } {
  const remarks = draft.remarks.trim();
  return {
    ...(draft.status && draft.status !== record.status ? { status: draft.status } : {}),
    ...(remarks !== (record.remarks ?? '') ? { remarks } : {}),
  };
}

/** THE MOST SPECIFIC MESSAGE IN A FAILURE: ITS FIRST VALIDATION DETAIL, OR THE GENERAL MESSAGE. */
export function failureMessage(result: ApiResult<unknown>): string {
  if (result.success) return '';
  return result.data.details[0]?.message ?? result.message;
}

/**
 * SPLITS BULK VALIDATION DETAILS INTO PER-RECORD MESSAGES ("records.3.studentId"
 * → INDEX 3) AND THE REST (E.G. attendanceDate), KEEPING THE FIRST MESSAGE PER RECORD.
 */
export function splitBulkIssues(details: readonly ValidationIssue[]): { byIndex: Map<number, string>; general: string[] } {
  const byIndex = new Map<number, string>();
  const general: string[] = [];
  for (const issue of details) {
    const match = /^records\.(\d+)(\.|$)/.exec(issue.path);
    if (!match) {
      general.push(issue.message);
      continue;
    }
    const index = Number(match[1]);
    if (!byIndex.has(index)) byIndex.set(index, issue.message);
  }
  return { byIndex, general };
}

/** RUNS `worker` OVER `items` WITH AT MOST `limit` IN FLIGHT, RETURNING RESULTS IN INPUT ORDER. */
export async function runWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

/** SPLITS `items` INTO CHUNKS OF AT MOST `size`. */
export function chunk<TItem>(items: readonly TItem[], size: number): TItem[][] {
  const chunks: TItem[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** A VALID "YYYY-MM-DD" THAT IS NOT AFTER `latest`. */
export function isSelectableDate(date: string, latest: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= latest;
}

/** THE SUMMARY TOASTS AFTER A SAVE: SUCCESS ONLY FOR WHAT THE SERVER CONFIRMED, AND AN ERROR FOR WHAT FAILED. */
export function announceAttendanceSave(counts: { created: number; corrected: number; failed: number }, noun: string) {
  const savedCount = counts.created + counts.corrected;
  if (savedCount > 0) {
    const parts = [counts.created > 0 ? `${counts.created} new` : '', counts.corrected > 0 ? `${counts.corrected} corrected` : ''].filter(Boolean);
    toast.success(`Saved attendance for ${pluralize(savedCount, noun)} (${parts.join(', ')}).`);
  }
  if (counts.failed > 0) toast.error(`${pluralize(counts.failed, noun)} not saved. See the details on this page.`);
}

/** "Asha Verma", "Asha Verma and Ravi Kumar", "Asha Verma, Ravi Kumar and 3 others". */
export function listNames(names: readonly string[], shown = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  const visible = names.slice(0, shown);
  const remaining = names.length - visible.length;
  if (remaining > 0) return `${visible.join(', ')} and ${pluralize(remaining, 'other')}`;
  return `${visible.slice(0, -1).join(', ')} and ${visible[visible.length - 1]}`;
}
