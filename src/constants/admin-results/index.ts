/** THE BULK ENDPOINT TAKES 1–200 RECORDS, ALL OR NOTHING. */
export const MAX_BULK_MARKS = 200;

/** CORRECTIONS ARE ONE PATCH EACH; THIS MANY RUN AT ONCE. */
export const CORRECTION_CONCURRENCY = 4;

export const MARKS_MESSAGES = {
  cannotClear: "A saved mark can't be cleared. Enter the corrected mark instead.",
  remarksNeedMark: 'Enter a mark to save these remarks.',
  remarksTooLong: 'Use at most 500 characters.',
  conflict: 'Someone else changed this mark since you loaded it. The latest mark is shown; re-enter your correction if it is still needed.',
  inactive: 'Account deactivated',
} as const;

/** THE API'S LIMIT ON REMARKS. */
export const MAX_REMARKS_LENGTH = 500;
