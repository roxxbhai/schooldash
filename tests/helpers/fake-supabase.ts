import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Minimal in-memory stand-in for the parts of SupabaseClient that the auth
 * modules use: `auth.getUser()` and `from(table).select().eq().limit()
 * .maybeSingle()`. Rows are filtered by the `eq` calls, so tests exercise the
 * real query shape in lib/auth/repository.ts.
 */

export type Row = Record<string, unknown>;

export interface FakeSupabaseOptions {
  user?: User | null;
  authError?: Error | null;
  tables?: Record<string, Row[]>;
  /** Make every query on these tables fail with the given PostgREST code. */
  failingTables?: Record<string, string>;
}

export interface RecordedQuery {
  table: string;
  columns: string;
  filters: [string, unknown][];
}

export function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const query: RecordedQuery = { table, columns: "", filters: [] };
    queries.push(query);
    let max = Infinity;

    const builder = {
      select(columns: string) {
        query.columns = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        query.filters.push([column, value]);
        return builder;
      },
      limit(count: number) {
        max = count;
        return builder;
      },
      async maybeSingle() {
        const failure = options.failingTables?.[table];
        if (failure !== undefined) {
          return { data: null, error: { code: failure, message: "failed" } };
        }
        const columns = query.columns.split(",").map((c) => c.trim());
        const rows = (options.tables?.[table] ?? [])
          .filter((row) => query.filters.every(([c, v]) => row[c] === v))
          .slice(0, max);
        if (rows.length > 1) {
          return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
        }
        if (rows.length === 0) return { data: null, error: null };
        return {
          data: Object.fromEntries(columns.map((c) => [c, rows[0][c]])),
          error: null,
        };
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () =>
        options.authError
          ? { data: { user: null }, error: options.authError }
          : { data: { user: options.user ?? null }, error: null },
    },
    from,
  } as unknown as SupabaseClient;

  return { client, queries };
}

export function authUser(id: string, metadata: Record<string, unknown> = {}): User {
  return {
    id,
    aud: "authenticated",
    app_metadata: metadata,
    user_metadata: metadata,
    created_at: new Date(0).toISOString(),
  } as User;
}
