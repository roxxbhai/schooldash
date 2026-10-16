import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks of the initial schema migration. Behaviour against the live
// database is covered by tests/integration (npm run test:integration).

const schemaPath = path.resolve(
  __dirname,
  '../supabase/migrations/20261015142406_initial_schema.sql',
);
const readmePath = path.resolve(__dirname, '../db/README.md');

const EXPECTED_TABLES = [
  'users',
  'students',
  'teachers',
  'academicYears',
  'classes',
  'studentEnrollments',
  'subjects',
  'teacherAssignments',
  'studentAttendance',
  'teacherAttendance',
  'exams',
  'examSubjects',
  'results',
  'timetableEntries',
  'notices',
  'noticeAudiences',
  'auditLogs',
] as const;

const EXPECTED_ENUMS: Record<string, string[]> = {
  userRole: ['admin', 'teacher', 'student'],
  attendanceStatus: ['present', 'absent', 'late', 'leave'],
  noticeStatus: ['draft', 'published', 'archived'],
};

const rawSql = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf8') : '';

/** Removes comments and dollar-quoted function bodies, normalises whitespace. */
const sql = rawSql
  .replace(/\$\$[\s\S]*?\$\$/g, '$$$$')
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ');

/** Extracts the body of each `create table "x" ( ... );` statement. */
function tableBlocks(): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = /create table "(\w+)" \(/g;
  for (const match of sql.matchAll(pattern)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (depth > 0 && i < sql.length) {
      if (sql[i] === '(') depth++;
      if (sql[i] === ')') depth--;
      i++;
    }
    blocks.set(match[1], sql.slice(start, i - 1));
  }
  return blocks;
}

const blocks = tableBlocks();

function block(table: string): string {
  const body = blocks.get(table);
  if (!body) throw new Error(`No create table block for "${table}"`);
  return body;
}

function quotedList(list: string): string[] {
  return [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

describe('schema file', () => {
  it('exists alongside its design document', () => {
    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(readmePath)).toBe(true);
    expect(rawSql.length).toBeGreaterThan(0);
  });

  it('has balanced parentheses', () => {
    let depth = 0;
    for (const char of sql) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('contains no destructive or data statements', () => {
    expect(sql).not.toMatch(/\b(drop|truncate)\b/i);
    expect(sql).not.toMatch(/\binsert into\b/i);
  });

  it('quotes every camelCase identifier', () => {
    const withoutStrings = sql.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    expect(withoutStrings.match(/\b[a-z]+[A-Z]\w*\b/g) ?? []).toEqual([]);
  });
});

describe('tables', () => {
  it('defines exactly the 17 expected tables', () => {
    expect([...blocks.keys()].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it.each(EXPECTED_TABLES)('%s has a UUID primary key', (table) => {
    expect(block(table)).toMatch(
      /"id" uuid primary key default gen_random_uuid\(\)/,
    );
  });

  it('creates tables in foreign-key dependency order', () => {
    const order = [...blocks.keys()];
    for (const [table, body] of blocks) {
      const referenced = [...body.matchAll(/references "(\w+)"/g)].map((m) => m[1]);
      for (const target of referenced) {
        expect(EXPECTED_TABLES, `${table} → ${target}`).toContain(target);
        if (target !== table) {
          expect(
            order.indexOf(target),
            `${target} must be created before ${table}`,
          ).toBeLessThan(order.indexOf(table));
        }
      }
    }
  });

  it('indexes the leading column of every foreign key', () => {
    for (const [table, body] of blocks) {
      const fkLeading = [
        ...[...body.matchAll(/"(\w+)" [^,]*?references "/g)].map((m) => m[1]),
        ...[...body.matchAll(/foreign key \(([^)]*)\)/g)].map(
          (m) => quotedList(m[1])[0],
        ),
      ];

      const indexed = new Set<string>(['id']);
      for (const m of body.matchAll(/"(\w+)" [^,]*?\bunique\b/g)) indexed.add(m[1]);
      for (const m of body.matchAll(/\bunique \(([^)]*)\)/g)) indexed.add(quotedList(m[1])[0]);
      const indexPattern = new RegExp(
        `create (?:unique )?index "\\w+" on "${table}" \\(([^)]*)\\)`,
        'g',
      );
      for (const m of sql.matchAll(indexPattern)) indexed.add(quotedList(m[1])[0]);

      for (const column of fkLeading) {
        expect(indexed.has(column), `${table}.${column} is unindexed`).toBe(true);
      }
    }
  });
});

describe('enums', () => {
  it.each(Object.entries(EXPECTED_ENUMS))('defines %s', (name, values) => {
    const match = sql.match(new RegExp(`create type "${name}" as enum \\(([^)]*)\\)`));
    expect(match, name).not.toBeNull();
    const actual = [...match![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(actual).toEqual(values);
  });

  it('uses the enums for role, attendance and notice status columns', () => {
    expect(block('users')).toMatch(/"role" "userRole" not null/);
    expect(block('studentAttendance')).toMatch(/"status" "attendanceStatus" not null/);
    expect(block('teacherAttendance')).toMatch(/"status" "attendanceStatus" not null/);
    expect(block('notices')).toMatch(/"status" "noticeStatus" not null/);
    expect(block('noticeAudiences')).toMatch(/"audienceRole" "userRole"/);
  });
});

describe('relationships and constraints', () => {
  it('links users to Supabase Auth one-to-one', () => {
    expect(block('users')).toMatch(
      /"authUserId" uuid not null unique references auth\.users \("id"\) on delete restrict/,
    );
  });

  it('ties student and teacher profiles to users of the matching role', () => {
    expect(block('users')).toMatch(/unique \("id", "role"\)/);
    for (const [table, role] of [
      ['students', 'student'],
      ['teachers', 'teacher'],
    ]) {
      expect(block(table)).toMatch(/"userId" uuid not null unique/);
      expect(block(table)).toMatch(new RegExp(`check \\("role" = '${role}'\\)`));
      expect(block(table)).toMatch(
        /foreign key \("userId", "role"\) references "users" \("id", "role"\) on update restrict on delete restrict/,
      );
    }
  });

  it('preserves history: cascade deletes only owned notice audiences', () => {
    const cascades = [...blocks].filter(([, body]) => /on delete cascade/.test(body));
    expect(cascades.map(([table]) => table)).toEqual(['noticeAudiences']);
    expect(block('noticeAudiences')).toMatch(
      /"noticeId" uuid not null references "notices" \("id"\) on delete cascade/,
    );
  });

  it('models deactivation rather than deletion of accounts', () => {
    expect(block('users')).toMatch(/"isActive" boolean not null default true/);
    expect(block('users')).toMatch(/check \("isActive" = \("deactivatedAt" is null\)\)/);
  });

  it('enforces marks and maximum-marks constraints', () => {
    expect(block('examSubjects')).toMatch(/"maxMarks" numeric\(6, 2\) not null/);
    expect(block('examSubjects')).toMatch(/check \("maxMarks" > 0\)/);
    expect(block('examSubjects')).toMatch(/"passMarks" <= "maxMarks"/);
    expect(block('results')).toMatch(/"marksObtained" numeric\(6, 2\) not null/);
    expect(block('results')).toMatch(/check \("marksObtained" >= 0\)/);

    // Cross-table rule marksObtained <= maxMarks, enforced in both directions.
    expect(rawSql).toMatch(/new\."marksObtained" > "limitMarks"/);
    expect(sql).toMatch(
      /create trigger "resultsEnforceMarksWithinMax" before insert or update of "marksObtained", "examSubjectId" on "results"/,
    );
    expect(rawSql).toMatch(/r\."marksObtained" > new\."maxMarks"/);
    expect(sql).toMatch(
      /create trigger "examSubjectsPreventMaxMarksBelowResults" before update of "maxMarks" on "examSubjects"/,
    );
  });

  it('requires attendance and results to reference a real enrollment', () => {
    for (const table of ['studentAttendance', 'results']) {
      expect(block(table)).toMatch(
        /foreign key \("studentId", "classId"\) references "studentEnrollments" \("studentId", "classId"\)/,
      );
    }
    expect(block('results')).toMatch(
      /foreign key \("examSubjectId", "classId"\) references "examSubjects" \("id", "classId"\)/,
    );
  });

  it('keeps enrollments and exam papers within one academic year', () => {
    expect(block('studentEnrollments')).toMatch(
      /foreign key \("classId", "academicYearId"\) references "classes" \("id", "academicYearId"\)/,
    );
    expect(block('examSubjects')).toMatch(
      /foreign key \("examId", "academicYearId"\) references "exams" \("id", "academicYearId"\)/,
    );
    expect(block('examSubjects')).toMatch(
      /foreign key \("classId", "academicYearId"\) references "classes" \("id", "academicYearId"\)/,
    );
  });

  it.each([
    ['studentEnrollments', '"studentId", "academicYearId"'],
    ['studentEnrollments', '"classId", "rollNumber"'],
    ['classes', '"academicYearId", "name", "section"'],
    ['teacherAssignments', '"teacherId", "classId", "subjectId"'],
    ['studentAttendance', '"studentId", "attendanceDate"'],
    ['teacherAttendance', '"teacherId", "attendanceDate"'],
    ['exams', '"academicYearId", "name"'],
    ['examSubjects', '"examId", "classId", "subjectId"'],
    ['results', '"examSubjectId", "studentId"'],
    ['timetableEntries', '"classId", "dayOfWeek", "startTime"'],
  ])('%s is unique on (%s)', (table, columns) => {
    expect(block(table)).toContain(`unique (${columns})`);
  });

  it('validates ranges with check constraints', () => {
    expect(block('academicYears')).toMatch(/check \("endDate" > "startDate"\)/);
    expect(block('timetableEntries')).toMatch(/check \("dayOfWeek" between 1 and 7\)/);
    expect(block('timetableEntries')).toMatch(/check \("endTime" > "startTime"\)/);
    expect(block('notices')).toMatch(
      /check \("status" <> 'published' or "publishedAt" is not null\)/,
    );
    expect(block('noticeAudiences')).toMatch(
      /check \(num_nonnulls\("audienceRole", "classId"\) = 1\)/,
    );
  });

  it('allows only one current academic year', () => {
    expect(sql).toMatch(
      /create unique index "\w+" on "academicYears" \("isCurrent"\) where "isCurrent"/,
    );
  });

  it('pins search_path on every function', () => {
    const functions = sql.match(/create function "\w+"\(\)[^$]*\$\$/g) ?? [];
    expect(functions.length).toBe(4);
    for (const definition of functions) {
      expect(definition).toContain("set search_path = ''");
    }
  });

  it('makes audit logs append-only', () => {
    expect(sql).toMatch(
      /create trigger "auditLogsPreventMutation" before update or delete on "auditLogs"/,
    );
  });
});

describe('row level security', () => {
  it.each(EXPECTED_TABLES)('enables RLS on %s', (table) => {
    expect(sql).toContain(`alter table "${table}" enable row level security;`);
  });

  it('does not define policies in the schema (design is documented only)', () => {
    expect(sql).not.toMatch(/\bcreate policy\b/i);
  });
});
