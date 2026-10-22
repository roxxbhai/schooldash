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

/** EMPTY-STATE WORDING PER PORTAL: ADMINS CAN FIX THE GAP THEMSELVES, TEACHERS ARE TOLD WHO CAN. */
export const MARKS_PORTAL_COPY = {
  ADMIN: {
    noPapers: 'Add papers on the exam page before entering marks.',
    noStudents: 'Enroll students into the class to enter their marks.',
    choosePaper: 'Only classes with papers in this exam are listed.',
  },
  TEACHER: {
    noPapers: 'This exam has no papers for the subjects you teach.',
    noStudents: 'The school office enrolls students into classes.',
    choosePaper: 'Only your classes and subjects with papers in this exam are listed.',
  },
} as const;
