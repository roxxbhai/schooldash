import pg from 'pg';
import { expect } from 'vitest';
import { ids, seedSql } from './school';

/**
 * Direct Postgres access for RLS/schema tests against the real project.
 *
 * Every test runs inside a transaction that is ALWAYS rolled back, so the
 * seeded school and every write attempt leave nothing behind. Policies are
 * exercised by switching to the real `authenticated` / `anon` roles and
 * setting the same JWT claims PostgREST would, so `auth.uid()` and every
 * policy, grant and trigger behave exactly as for API traffic.
 */

export type Who = keyof typeof ids.auth;

export function requireDbUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set (see .env.example).');
  return url;
}

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString: requireDbUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/** Opens a transaction and seeds the fixture school as the database owner. */
export async function beginSeeded(client: pg.Client): Promise<void> {
  await client.query('begin');
  await client.query(seedSql());
}

export async function rollback(client: pg.Client): Promise<void> {
  await client.query('rollback');
}

/** Acts as a signed-in user for the rest of the transaction (until reset). */
export async function actAs(client: pg.Client, who: Who): Promise<void> {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: ids.auth[who], role: 'authenticated', aud: 'authenticated' }),
  ]);
  await client.query('set local role authenticated');
}

export async function actAsAnon(client: pg.Client): Promise<void> {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'anon' }),
  ]);
  await client.query('set local role anon');
}

export async function actAsOwner(client: pg.Client): Promise<void> {
  await client.query('reset role');
}

/** Runs a statement that must fail with the given SQLSTATE, without aborting the transaction. */
export async function expectSqlError(
  client: pg.Client,
  sql: string,
  params: unknown[],
  code: string,
): Promise<void> {
  await client.query('savepoint expect_error');
  try {
    await client.query(sql, params);
  } catch (error) {
    await client.query('rollback to savepoint expect_error');
    expect((error as { code?: string }).code, (error as Error).message).toBe(code);
    return;
  }
  await client.query('rollback to savepoint expect_error');
  throw new Error(`Expected SQLSTATE ${code} but the statement succeeded: ${sql}`);
}

/** Row count of a statement (for UPDATE/DELETE that RLS silently filters to 0 rows). */
export async function affected(client: pg.Client, sql: string, params: unknown[] = []): Promise<number> {
  await client.query('savepoint affected');
  try {
    const result = await client.query(sql, params);
    return result.rowCount ?? 0;
  } finally {
    await client.query('rollback to savepoint affected');
  }
}

export async function ids_of(client: pg.Client, sql: string, params: unknown[] = []): Promise<string[]> {
  const result = await client.query(sql, params);
  return result.rows.map((row) => String(Object.values(row)[0])).sort();
}

/** SQLSTATEs used in assertions. */
export const SQLSTATE = {
  insufficientPrivilege: '42501',
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
} as const;
