import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLSTATE, affected, beginSeeded, connect, expectSqlError, rollback } from './helpers/db';
import { ids } from './helpers/school';

/**
 * Verifies the APPLIED schema in the real Supabase database matches the
 * version-controlled migrations, and that constraints reject invalid data.
 * Writes happen inside rolled-back transactions.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const TABLES = [
  'accountSetupCodes', 'academicYears', 'auditLogs', 'classes', 'examSubjects', 'exams', 'noticeAudiences',
  'notices', 'results', 'studentAttendance', 'studentEnrollments', 'students', 'subjects',
  'teacherAssignments', 'teacherAttendance', 'teachers', 'timetableEntries', 'users',
];

let db: pg.Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

describe('applied schema', () => {
  it('has every local migration applied, and nothing else', async () => {
    const local = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0])
      .sort();
    const remote = (await rows('select version from supabase_migrations.schema_migrations order by 1')).map(
      (r) => r.version,
    );
    expect(remote).toEqual(local);
  });

  // Docker (and therefore `supabase db diff`) is unavailable here, so the live
  // catalog is compared with what the migrations declare, statement by statement.
  const migrationSql = () =>
    readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').replace(/--[^\n]*/g, ''))
      .join('\n');

  it('has exactly the policies the migrations declare (replaying create/drop policy in order)', async () => {
    const declared = new Map<string, string>();
    const statement = /(create|drop) policy "([^"]+)" on (?:public\.)?"?(\w+)"?(?:\s+for (\w+))?/gi;
    for (const [, verb, name, table, command] of migrationSql().matchAll(statement)) {
      const key = `${table}.${name}`;
      if (verb.toLowerCase() === 'drop') declared.delete(key);
      else declared.set(key, (command ?? 'all').toUpperCase());
    }
    const live = await rows('select tablename, policyname, cmd, roles::text[] as roles from pg_policies where schemaname = \'public\'');
    expect(new Map(live.map((p) => [`${p.tablename}.${p.policyname}`, p.cmd]))).toEqual(declared);
    expect(live.every((p) => p.roles.length === 1 && p.roles[0] === 'authenticated')).toBe(true);
  });

  it('has every function body exactly as the latest migration defines it', async () => {
    const declared = new Map<string, string>();
    const fn = /create (?:or replace )?function (?:(\w+)\.)?"(\w+)"\([\s\S]*?\bas \$\$([\s\S]*?)\$\$/gi;
    for (const [, schema, name, body] of migrationSql().matchAll(fn)) declared.set(`${schema ?? 'public'}.${name}`, body.trim());
    expect(declared.size).toBeGreaterThan(25);
    const live = await rows(
      'select n.nspname || \'.\' || p.proname as name, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || \'.\' || p.proname = any($1)',
      [[...declared.keys()]],
    );
    expect(live.map((r) => r.name).sort()).toEqual([...declared.keys()].sort());
    for (const r of live) expect(r.prosrc.replace(/--[^\n]*/g, '').trim(), r.name).toBe(declared.get(r.name));
  });

  it('has exactly the 18 application tables in public, all with RLS enabled', async () => {
    const tables = await rows(`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(tables.map((t) => t.relname)).toEqual([...TABLES].sort());
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
  });

  it('has the agreed enums', async () => {
    const enums = await rows(`
      select t.typname, array_agg(e.enumlabel order by e.enumsortorder)::text[] as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
      group by 1 order by 1`);
    expect(enums).toEqual([
      { typname: 'attendanceStatus', labels: ['present', 'absent', 'late', 'leave'] },
      { typname: 'noticeStatus', labels: ['draft', 'published', 'archived'] },
      { typname: 'userRole', labels: ['admin', 'teacher', 'student'] },
    ]);
  });

  it('uses UUID primary keys on every table', async () => {
    const pks = await rows(`
      select tc.table_name, kcu.column_name, c.data_type
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu using (constraint_schema, constraint_name)
      join information_schema.columns c on c.table_schema = tc.table_schema
        and c.table_name = tc.table_name and c.column_name = kcu.column_name
      where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY' order by 1`);
    expect(pks.map((p) => p.table_name)).toEqual([...TABLES].sort());
    expect(pks.every((p) => p.column_name === 'id' && p.data_type === 'uuid')).toBe(true);
  });

  it('links users.authUserId to auth.users with ON DELETE RESTRICT', async () => {
    const [fk] = await rows(`
      select confrelid::regclass::text as target, confdeltype
      from pg_constraint where conrelid = 'public.users'::regclass and contype = 'f'`);
    expect(fk).toEqual({ target: 'auth.users', confdeltype: 'r' });
  });

  it('only noticeAudiences cascades on delete (history is preserved elsewhere)', async () => {
    const cascading = await rows(`
      select conrelid::regclass::text as tbl from pg_constraint
      where contype = 'f' and confdeltype = 'c' and connamespace = 'public'::regnamespace`);
    expect(cascading.map((r) => r.tbl)).toEqual(['"noticeAudiences"']);
  });

  it('covers every foreign key with an index', async () => {
    const unindexed = await rows(`
      select c.conrelid::regclass::text as tbl, c.conname
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        )`);
    expect(unindexed).toEqual([]);
  });

  it('exposes nothing to anon and only provisioning RPCs to service_role', async () => {
    expect(
      await rows('select table_name from information_schema.role_table_grants where table_schema = \'public\' and grantee = \'anon\''),
    ).toEqual([]);
    const callable = await rows(`
      select p.proname,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authed
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('provisionAppUser', 'findAuthUserIdByEmail') order by 1`);
    expect(callable).toEqual([
      { proname: 'findAuthUserIdByEmail', anon: false, authed: false },
      { proname: 'provisionAppUser', anon: false, authed: false },
    ]);
  });

  it('allows only service_role to execute the privileged public functions', async () => {
    const grants = await rows(`
      select p.proname,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authed,
        has_function_privilege('service_role', p.oid, 'execute') service
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and p.proname <> 'rls_auto_enable' order by 1`);
    expect(grants).toEqual([
      { proname: 'findAuthUserIdByEmail', anon: false, authed: false, service: true },
      { proname: 'setAppUserStatus', anon: false, authed: false, service: true },
    ]);
  });

  it('keeps RLS helper functions out of the exposed schema', async () => {
    const exposed = await rows(`
      select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and p.proname not in (
          'findAuthUserIdByEmail', -- reads auth.users (service_role only)
          'setAppUserStatus',      -- deletes auth.sessions on deactivation (service_role only)
          'rls_auto_enable'        -- Supabase-managed event trigger
        )`);
    expect(exposed).toEqual([]);
  });
});

describe('constraints reject invalid data', () => {
  beforeEach(async () => beginSeeded(db));
  afterEach(async () => rollback(db));

  it('accepts valid inserts and reads them back', async () => {
    const { rows: [row] } = await db.query(
      'insert into public."subjects" (code, name) values (\'IT-HIST\', \'History\') returning id, code',
    );
    expect(row.code).toBe('IT-HIST');
    expect((await db.query('select name from public."subjects" where id = $1', [row.id])).rows).toEqual([{ name: 'History' }]);
  });

  it('rejects duplicate admission numbers, emails and subject codes', async () => {
    await expectSqlError(db, 'update public."students" set "admissionNumber" = \'IT-ADM-A\' where id = $1', [ids.student.b], SQLSTATE.uniqueViolation);
    await expectSqlError(db, 'update public."users" set email = \'IT-STUDENTA@example.com\' where id = $1', [ids.user.studentB], SQLSTATE.uniqueViolation);
    await expectSqlError(db, 'insert into public."subjects" (code, name) values (\'IT-MATH\', \'Dup\')', [], SQLSTATE.uniqueViolation);
  });

  it('rejects a second current academic year', async () => {
    await db.query('update public."academicYears" set "isCurrent" = true where id = $1', [ids.year]);
    await expectSqlError(
      db,
      'insert into public."academicYears" (name, "startDate", "endDate", "isCurrent") values (\'IT-2100\', \'2100-04-01\', \'2101-03-31\', true)',
      [],
      SQLSTATE.uniqueViolation,
    );
  });

  it('rejects attendance and results for students not enrolled in the class', async () => {
    await expectSqlError(
      db,
      'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2015-06-03\', \'present\', $3)',
      [ids.student.a, ids.class.tenB, ids.user.admin],
      SQLSTATE.foreignKeyViolation,
    );
    await expectSqlError(
      db,
      'insert into public."results" ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, 10, $4)',
      [ids.examSubject.tenBScience, ids.student.a, ids.class.tenB, ids.user.admin],
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('rejects a student profile attached to a non-student account', async () => {
    await expectSqlError(
      db,
      'insert into public."students" ("userId", "admissionNumber") values ($1, \'IT-ADM-T\')',
      [ids.user.teacherA],
      SQLSTATE.foreignKeyViolation,
    );
  });

  it("blocks changing a user's role while a profile depends on it", async () => {
    await expectSqlError(db, 'update public."users" set role = \'teacher\' where id = $1', [ids.user.studentA], SQLSTATE.foreignKeyViolation);
  });

  it('enforces marks within maxMarks in both directions', async () => {
    await expectSqlError(db, 'update public."results" set "marksObtained" = 101 where id = $1', [ids.result.aMaths], SQLSTATE.checkViolation);
    await expectSqlError(db, 'update public."results" set "marksObtained" = -1 where id = $1', [ids.result.aMaths], SQLSTATE.checkViolation);
    await expectSqlError(db, 'update public."examSubjects" set "maxMarks" = 50 where id = $1', [ids.examSubject.tenAMaths], SQLSTATE.checkViolation);
    expect(await affected(db, 'update public."results" set "marksObtained" = 100 where id = $1', [ids.result.aMaths])).toBe(1);
  });

  it('requires consistent deactivation and published-notice timestamps', async () => {
    await expectSqlError(db, 'update public."users" set "isActive" = false where id = $1', [ids.user.studentB], SQLSTATE.checkViolation);
    await expectSqlError(db, 'update public."notices" set status = \'published\', "publishedAt" = null where id = $1', [ids.notice.draft], SQLSTATE.checkViolation);
  });

  it('requires exactly one notice audience target', async () => {
    await expectSqlError(
      db,
      'insert into public."noticeAudiences" ("noticeId", "audienceRole", "classId") values ($1, \'student\', $2)',
      [ids.notice.draft, ids.class.tenA],
      SQLSTATE.checkViolation,
    );
  });

  it('refuses to delete an Auth user that owns application history', async () => {
    await expectSqlError(db, 'delete from auth.users where id = $1', [ids.auth.studentA], SQLSTATE.foreignKeyViolation);
  });

  it('maintains updatedAt automatically', async () => {
    // now() is frozen inside a transaction, so backdate first: the trigger
    // must overwrite any explicitly supplied value with now().
    await db.query('update public."subjects" set name = \'Mathematics\', "updatedAt" = \'2000-01-01\' where id = $1', [ids.subject.maths]);
    const { rows: [row] } = await db.query(
      'select name, "updatedAt" = now() as "isNow" from public."subjects" where id = $1',
      [ids.subject.maths],
    );
    expect(row).toEqual({ name: 'Mathematics', isNow: true });
  });
});
