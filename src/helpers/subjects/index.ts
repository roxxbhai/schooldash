/** MIRRORS THE "subjectsBeforeWrite" TRIGGER (MIGRATION 18): ONE SPACE BETWEEN WORDS, NONE AROUND, UPPER-CASE. */
export function normalizeSubjectName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}
