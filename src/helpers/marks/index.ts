/**
 * MARKS AS TYPED INTO A FORM. THE API STORES NUMERIC(6,2): 0 – 9999.99 WITH AT
 * MOST TWO DECIMALS, AND SENDS THEM AS JSON NUMBERS. A BLANK FIELD MEANS "NOT
 * ENTERED"; 0 IS A REAL MARK.
 */

/** UP TO FOUR DIGITS, OPTIONALLY FOLLOWED BY ONE OR TWO DECIMALS: "0", "87", "87.5", "9999.99". */
const MARKS_TEXT_PATTERN = /^\d{1,4}(\.\d{1,2})?$/;

export function isMarksText(value: string): boolean {
  return MARKS_TEXT_PATTERN.test(value.trim());
}

/** "87.5" → 87.5; BLANK OR MALFORMED → NULL. */
export function parseMarks(value: string): number | null {
  const trimmed = value.trim();
  if (!isMarksText(trimmed)) return null;
  return Number(trimmed);
}

/** A STORED MARK (NUMBER, OR A STRING IF NUMERIC EVER ARRIVES AS TEXT) AS AN EDITABLE STRING: 87.5 → "87.5". */
export function marksToText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isNaN(number) ? '' : String(number);
}

/** WHY A TYPED MARK CAN'T BE SAVED FOR A PAPER OUT OF `maxMarks`, OR NULL WHEN IT IS FINE (BLANK IS FINE HERE). */
export function marksTextIssue(value: string, maxMarks: number): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!isMarksText(trimmed)) return 'Enter a number with at most two decimals.';
  if (Number(trimmed) > maxMarks) return `Marks can't be more than ${marksToText(maxMarks)}.`;
  return null;
}
