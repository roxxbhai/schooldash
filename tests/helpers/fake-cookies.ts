/**
 * A cookie store with the subset of Next.js `cookies()` behaviour the app
 * relies on: reads, writes, deletes, and "expired" writes that remove a
 * cookie. `writes` records every mutation for assertions.
 */
export interface CookieWrite {
  name: string;
  value: string;
  options?: { maxAge?: number; [key: string]: unknown };
}

export function fakeCookieStore(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const writes: CookieWrite[] = [];

  return {
    jar,
    writes,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set(name: string, value: string, options?: CookieWrite['options']) {
      writes.push({ name, value, options });
      if (value === '' || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
    delete(name: string) {
      writes.push({ name, value: '', options: { maxAge: 0 } });
      jar.delete(name);
    },
  };
}
