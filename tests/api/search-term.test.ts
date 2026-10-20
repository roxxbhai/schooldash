import { describe, expect, it } from 'vitest';
import { searchTermSchema } from '@/helpers/school-validation';

describe('searchTermSchema', () => {
  it.each(['Asha', 'MATH-10', 'v.k_sharma', 'राम कुमार', 'ज्योति'])('accepts %s', (term) => {
    expect(searchTermSchema.safeParse(term).success).toBe(true);
  });

  it.each(['a,b', 'x)', 'a*', '%', 'name"', 'x'.repeat(51)])('rejects %s, so PostgREST filter syntax can never be injected', (term) => {
    expect(searchTermSchema.safeParse(term).success).toBe(false);
  });
});
