import type { z } from 'zod';
import type { FieldErrors } from '@/types/api-client';

/** ARIA WIRING FOR A CONTROL INSIDE <FormField>: ITS ID, INVALID STATE, AND THE HINT OR ERROR THAT DESCRIBES IT. */
export function fieldControlProps(id: string, error: string | undefined, hasDescription = false) {
  const describedBy = error ? `${id}-error` : hasDescription ? `${id}-description` : undefined;
  return { id, name: id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy };
}

/** ZOD ISSUES AS { field: message }, KEEPING THE FIRST MESSAGE PER FIELD. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) errors[path] = issue.message;
  }
  return errors;
}

/** MOVES FOCUS TO THE FIRST INVALID FIELD, SO KEYBOARD AND SCREEN-READER USERS LAND ON THE PROBLEM. */
export function focusFirstInvalidField(form: HTMLFormElement | null) {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

/** A COPY OF `errors` WITHOUT `field`: CLEARS ONE FIELD'S ERROR AS THE PERSON EDITS IT. */
export function withoutKey<T extends Record<string, unknown>>(record: T, key: string): T {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
}
