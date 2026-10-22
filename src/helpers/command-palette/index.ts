/**
 * cmdk FILTER: AN ITEM MATCHES WHEN EVERY TYPED WORD STARTS ONE OF ITS KEYWORDS' WORDS
 * ("mark" FINDS "Marks entry", "aar" FINDS "Aarav Gupta"). STRICTER THAN cmdk'S DEFAULT
 * FUZZY SCORE, WHICH MATCHES LETTERS SCATTERED ACROSS UNRELATED WORDS.
 */
export function matchCommandItem(value: string, search: string, keywords?: string[]): number {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const words = (keywords ?? [value]).join(' ').toLowerCase().split(/[\s\-–·,.@()]+/).filter(Boolean);
  return terms.every((term) => words.some((word) => word.startsWith(term))) ? 1 : 0;
}
