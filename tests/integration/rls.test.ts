import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SQLSTATE,
  actAs,
  actAsAnon,
  actAsOwner,
  affected,
  beginSeeded,
  connect,
  expectSqlError,
  ids_of,
  rollback,
} from './helpers/db';
import { ids } from './helpers/school';

/**
 * REAL Row Level Security tests against the Supabase project's database.
 * Each test seeds the fixture school in a transaction, acts as a real
 * Postgres role with real JWT claims, and rolls everything back.
 */

const TABLES = [
  'users', 'students', 'teachers', 'academicYears', 'classes', 'studentEnrollments',
  'subjects', 'teacherAssignments', 'studentAttendance', 'teacherAttendance', 'exams',
  'examSubjects', 'results', 'timetableEntries', 'notices', 'noticeAudiences', 'auditLogs',
];

let db: pg.Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await beginSeeded(db);
});
afterEach(async () => {
  await rollback(db);
});

const select = (sql: string, params: unknown[] = []) => ids_of(db, sql, params);
const sorted = (...values: string[]) => [...values].sort();
const { student, user, result, attendance, notice, class: cls, examSubject } = ids;

describe('unauthenticated (anon role)', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    await actAsAnon(db);
    await expectSqlError(db, `select * from public."${table}" limit 1`, [], SQLSTATE.insufficientPrivilege);
  });

  it('cannot call RLS helpers or provisioning functions', async () => {
    await actAsAnon(db);
    await expectSqlError(db, 'select app."isAdmin"()', [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(
      db,
      'select public."provisionAppUser"($1, \'x@example.com\', \'X\', \'admin\')',
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
  });
});

describe('student', () => {
  beforeEach(async () => actAs(db, 'studentA'));

  it('reads only their own user, student, enrollment, attendance and result rows', async () => {
    expect(await select('select id from public."users"')).toEqual([user.studentA]);
    expect(await select('select id from public."students"')).toEqual([student.a]);
    expect(await select('select "studentId" from public."studentEnrollments"')).toEqual([student.a]);
    expect(await select('select id from public."studentAttendance"')).toEqual([attendance.a]);
    expect(await select('select id from public."results"')).toEqual(sorted(result.aMaths, result.aScience));
  });

  it("cannot read another student's records even when filtering for them explicitly", async () => {
    expect(await select('select id from public."students" where id = $1', [student.b])).toEqual([]);
    expect(await select('select id from public."results" where "studentId" = $1', [student.b])).toEqual([]);
    expect(await select('select id from public."studentAttendance" where "studentId" = $1', [student.b])).toEqual([]);
    expect(await select('select id from public."users" where id = $1', [user.studentB])).toEqual([]);
  });

  it('sees only their own class and its exam papers', async () => {
    expect(await select('select id from public."classes"')).toEqual([cls.tenA]);
    expect(await select('select id from public."examSubjects"')).toEqual(
      sorted(examSubject.tenAMaths, examSubject.tenAScience),
    );
  });

  it('sees only published notices addressed to students or their class', async () => {
    // Scoped to fixture notices: real notices addressed to all students are legitimately visible too.
    expect(await select('select id from public."notices" where id = any($1)', [Object.values(notice)])).toEqual([notice.allStudents]);
  });

  it('cannot read audit logs or auth.users', async () => {
    expect(await select('select id from public."auditLogs"')).toEqual([]);
    await expectSqlError(db, 'select id from auth.users', [], SQLSTATE.insufficientPrivilege);
  });

  it('can update their own name and phone', async () => {
    expect(await affected(db, 'update public."users" set "fullName" = \'New Name\', phone = \'123\' where id = $1', [user.studentA])).toBe(1);
  });

  it('cannot change their own role or active status (cannot self-promote)', async () => {
    await expectSqlError(db, 'update public."users" set role = \'admin\' where id = $1', [user.studentA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'update public."users" set "isActive" = true where id = $1', [user.studentA], SQLSTATE.insufficientPrivilege);
  });

  it('cannot create users or administrators', async () => {
    await expectSqlError(
      db,
      'insert into public."users" ("authUserId", email, "fullName", role) values ($1, \'x@example.com\', \'X\', \'admin\')',
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(
      db,
      'select public."provisionAppUser"($1, \'x@example.com\', \'X\', \'admin\')',
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot modify other people's data", async () => {
    expect(await affected(db, 'update public."users" set "fullName" = \'Hacked\' where id = $1', [user.studentB])).toBe(0);
    expect(await affected(db, 'update public."results" set "marksObtained" = 100 where id = $1', [result.aMaths])).toBe(0);
    await expectSqlError(
      db,
      'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2015-06-02\', \'present\', $3)',
      [student.a, cls.tenA, user.studentA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('cannot delete protected records', async () => {
    await expectSqlError(db, 'delete from public."results" where id = $1', [result.aMaths], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'delete from public."students" where id = $1', [student.a], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'delete from public."auditLogs"', [], SQLSTATE.insufficientPrivilege);
  });
});

describe('teacher', () => {
  it('reads attendance and students only for assigned classes', async () => {
    await actAs(db, 'teacherA');
    expect(await select('select id from public."studentAttendance"')).toEqual([attendance.a]);
    expect(await select('select id from public."students"')).toEqual(sorted(student.a, student.inactive));
    expect(await select('select id from public."classes"')).toEqual([cls.tenA]);
  });

  it('reads results only for assigned class AND subject', async () => {
    await actAs(db, 'teacherA'); // 10-A Maths only; 10-A Science has no teacher
    expect(await select('select id from public."results"')).toEqual([result.aMaths]);
  });

  it('sees user rows only for themselves and students they teach', async () => {
    await actAs(db, 'teacherA');
    expect(await select('select id from public."users"')).toEqual(
      sorted(user.teacherA, user.studentA, user.inactiveStudent),
    );
  });

  it('can mark attendance for an assigned class as themselves', async () => {
    await actAs(db, 'teacherA');
    expect(
      await affected(
        db,
        'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2015-06-02\', \'present\', $3)',
        [student.a, cls.tenA, user.teacherA],
      ),
    ).toBe(1);
  });

  it('cannot mark attendance for an unassigned class', async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(
      db,
      'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2015-06-02\', \'present\', $3)',
      [student.b, cls.tenB, user.teacherA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot record attendance in another user's name", async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(
      db,
      'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, \'2015-06-02\', \'present\', $3)',
      [student.a, cls.tenA, user.teacherB],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('can update results only for their own class + subject', async () => {
    await actAs(db, 'teacherA');
    const update = 'update public."results" set "marksObtained" = 90, "enteredByUserId" = $2 where id = $1';
    expect(await affected(db, update, [result.aMaths, user.teacherA])).toBe(1);
    expect(await affected(db, update, [result.aScience, user.teacherA])).toBe(0); // same class, other subject
    expect(await affected(db, update, [result.bScience, user.teacherA])).toBe(0); // other class
  });

  it('cannot enter results for an unassigned subject in an assigned class', async () => {
    // The fixture's only spare student in 10-A is deactivated, and migration 10
    // rejects marks for deactivated students in a BEFORE trigger (23514), which
    // runs before RLS. Reactivate them (rolled back) so this test isolates RLS.
    await actAsOwner(db);
    await db.query('update public.users set "isActive" = true, "deactivatedAt" = null where id = $1', [user.inactiveStudent]);
    await actAs(db, 'teacherA');
    await expectSqlError(
      db,
      'insert into public."results" ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, 50, $4)',
      [examSubject.tenAScience, student.inactive, cls.tenA, user.teacherA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('cannot enter results for a deactivated student, even in their own subject (migration 10)', async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(
      db,
      'insert into public."results" ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, 40, $4)',
      [examSubject.tenAMaths, student.inactive, cls.tenA, user.teacherA],
      SQLSTATE.checkViolation,
    );
  });

  it('cannot move a row into an unassigned class via UPDATE', async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(
      db,
      'update public."studentAttendance" set "classId" = $2 where id = $1',
      [attendance.a, cls.tenB],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('as class teacher, sees their class and notices addressed to it', async () => {
    await actAs(db, 'teacherB');
    expect(await select('select id from public."classes"')).toEqual([cls.tenB]);
    expect(await select('select id from public."notices" where id = any($1)', [Object.values(notice)])).toEqual(
      sorted(notice.classTenB, notice.teachersOnly),
    );
  });

  it('cannot read audit logs', async () => {
    await actAs(db, 'teacherA');
    expect(await select('select id from public."auditLogs"')).toEqual([]);
  });
});

describe('administrator', () => {
  beforeEach(async () => actAs(db, 'admin'));

  it('reads school-wide data, including drafts and audit logs', async () => {
    // Scoped to fixture rows so the assertions hold once the project has real data.
    const fixtureStudents = [student.a, student.b, student.inactive];
    const fixtureResults = Object.values(result);
    const fixtureNotices = Object.values(notice); // includes the draft
    expect(await select('select id from public."students" where id = any($1)', [fixtureStudents])).toEqual(sorted(...fixtureStudents));
    expect(await select('select id from public."results" where id = any($1)', [fixtureResults])).toEqual(sorted(...fixtureResults));
    expect(await select('select id from public."notices" where id = any($1)', [fixtureNotices])).toEqual(sorted(...fixtureNotices));
    expect((await select('select id from public."auditLogs"')).length).toBeGreaterThan(0);
  });

  it('can create reference data and edit profile details', async () => {
    expect(await affected(db, 'insert into public."subjects" (name) values (\'IT FIXTURE ART\')')).toBe(1);
    expect(await affected(db, 'update public."users" set "fullName" = \'Renamed\' where id = $1', [user.studentB])).toBe(1);
  });

  it('cannot change roles or account status through the API (provisioning service only)', async () => {
    await expectSqlError(db, 'update public."users" set role = \'admin\' where id = $1', [user.teacherA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'update public."users" set "isActive" = false where id = $1', [user.teacherA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'update public."users" set role = \'student\' where id = $1', [user.admin], SQLSTATE.insufficientPrivilege);
  });

  it('cannot create users directly or delete historical records', async () => {
    await expectSqlError(
      db,
      'insert into public."users" ("authUserId", email, "fullName", role) values ($1, \'x@example.com\', \'X\', \'admin\')',
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(db, 'delete from public."results" where id = $1', [result.aMaths], SQLSTATE.insufficientPrivilege);
  });

  it('cannot alter audit logs', async () => {
    await expectSqlError(db, 'update public."auditLogs" set action = \'x\'', [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'delete from public."auditLogs"', [], SQLSTATE.insufficientPrivilege);
  });
});

describe('deactivated and unprovisioned identities', () => {
  it('a deactivated user can read only their own users row (to learn their status)', async () => {
    await actAs(db, 'inactiveStudent');
    expect(await select('select id from public."users"')).toEqual([user.inactiveStudent]);
    for (const table of ['students', 'results', 'studentAttendance', 'notices', 'classes', 'subjects', 'teachers']) {
      expect(await select(`select id from public."${table}"`), table).toEqual([]);
    }
  });

  it('a deactivated user cannot reactivate themselves', async () => {
    await actAs(db, 'inactiveStudent');
    await expectSqlError(db, 'update public."users" set "isActive" = true where id = $1', [user.inactiveStudent], SQLSTATE.insufficientPrivilege);
  });

  it('an Auth identity without an application account sees nothing', async () => {
    await actAs(db, 'unprovisioned');
    for (const table of TABLES) {
      expect(await select(`select id from public."${table}"`), table).toEqual([]);
    }
  });
});

describe('defense in depth (database owner paths)', () => {
  it('the self-privilege trigger blocks role changes for the signed-in user even without column grants', async () => {
    await actAsOwner(db);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: ids.auth.studentA, role: 'authenticated' }),
    ]);
    await expectSqlError(db, 'update public."users" set role = \'admin\' where id = $1', [user.studentA], SQLSTATE.insufficientPrivilege);
  });

  it('audit logs are append-only even for the database owner', async () => {
    await actAsOwner(db);
    await expectSqlError(db, 'update public."auditLogs" set action = \'tampered\'', [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'delete from public."auditLogs"', [], SQLSTATE.insufficientPrivilege);
  });
});

describe('attendance integrity (migration 8)', () => {
  const insertStudentAttendance = 'insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, $3, \'present\', $4)';

  it('a teacher cannot reassign attendance to another student or date — only status/remarks are editable', async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(db, 'update public."studentAttendance" set "studentId" = $2 where id = $1', [attendance.a, student.inactive], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'update public."studentAttendance" set "attendanceDate" = \'2015-06-09\' where id = $1', [attendance.a], SQLSTATE.insufficientPrivilege);
    expect(await affected(db, 'update public."studentAttendance" set status = \'late\', remarks = \'bus\', "markedByUserId" = $2 where id = $1', [attendance.a, user.teacherA])).toBe(1);
  });

  it('admins cannot reassign teacher attendance either', async () => {
    await actAs(db, 'admin');
    const { rows } = await db.query(
      'insert into public."teacherAttendance" ("teacherId", "attendanceDate", status, "markedByUserId") values ($1, \'2015-06-01\', \'present\', $2) returning id',
      [ids.teacher.a, user.admin],
    );
    await expectSqlError(db, 'update public."teacherAttendance" set "teacherId" = $2 where id = $1', [rows[0].id, ids.teacher.b], SQLSTATE.insufficientPrivilege);
  });

  it("rejects future dates and dates outside the class's academic year (even via direct writes)", async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(db, insertStudentAttendance, [student.a, cls.tenA, '2999-01-01', user.teacherA], SQLSTATE.checkViolation);
    await expectSqlError(db, insertStudentAttendance, [student.a, cls.tenA, '2014-06-01', user.teacherA], SQLSTATE.checkViolation);
    expect(await affected(db, insertStudentAttendance, [student.a, cls.tenA, '2015-06-05', user.teacherA])).toBe(1);
  });

  it('rejects new attendance for deactivated students and teachers', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, insertStudentAttendance, [student.inactive, cls.tenA, '2015-06-05', user.admin], SQLSTATE.checkViolation);
    await actAsOwner(db);
    await db.query('update public.users set "isActive" = false, "deactivatedAt" = now() where id = $1', [user.teacherB]);
    await actAs(db, 'admin');
    await expectSqlError(
      db,
      'insert into public."teacherAttendance" ("teacherId", "attendanceDate", status, "markedByUserId") values ($1, \'2015-06-01\', \'present\', $2)',
      [ids.teacher.b, user.admin],
      SQLSTATE.checkViolation,
    );
  });

  it('attendance corrections are audited with the editor', async () => {
    await actAs(db, 'teacherA');
    await db.query('update public."studentAttendance" set status = \'absent\', "markedByUserId" = $2 where id = $1', [attendance.a, user.teacherA]);
    await actAsOwner(db);
    const { rows } = await db.query(
      'select action, "actorUserId", "oldData"->>\'status\' as before, "newData"->>\'status\' as after from public."auditLogs" where "entityId" = $1',
      [attendance.a],
    );
    expect(rows).toEqual([{ action: 'studentAttendance.update', actorUserId: user.teacherA, before: 'present', after: 'absent' }]);
  });
});

describe('REGRESSION: column-level UPDATE privileges (Phase 5 audit, migration 9)', () => {
  it('a teacher cannot move marks to another student, paper or class — only the mark and remarks change', async () => {
    await actAs(db, 'teacherA');
    for (const [column, value] of [
      ['studentId', student.inactive],
      ['examSubjectId', examSubject.tenAScience],
      ['classId', cls.tenB],
    ] as const) {
      await expectSqlError(db, `update public."results" set "${column}" = $2 where id = $1`, [result.aMaths, value], SQLSTATE.insufficientPrivilege);
    }
    expect(await affected(db, 'update public."results" set "marksObtained" = 91, remarks = \'ok\', "enteredByUserId" = $2 where id = $1', [result.aMaths, user.teacherA])).toBe(1);
  });

  it('an admin cannot relabel an exam paper that has results', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, 'update public."examSubjects" set "subjectId" = $2 where id = $1', [examSubject.tenAMaths, ids.subject.science], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'update public."examSubjects" set "classId" = $2 where id = $1', [examSubject.tenAMaths, cls.tenB], SQLSTATE.insufficientPrivilege);
    expect(await affected(db, 'update public."examSubjects" set "maxMarks" = 120, "passMarks" = 40 where id = $1', [examSubject.tenAMaths])).toBe(1);
  });

  it.each([
    ['academicYears', 'id'], ['academicYears', 'createdAt'], ['academicYears', 'updatedAt'],
    ['classes', 'academicYearId'], ['classes', 'id'],
    ['exams', 'academicYearId'], ['exams', 'updatedAt'],
    ['subjects', 'createdAt'],
    ['students', 'userId'], ['teachers', 'userId'],
    ['studentEnrollments', 'studentId'], ['studentEnrollments', 'academicYearId'],
    ['teacherAssignments', 'teacherId'],
    ['results', 'updatedAt'],
  ])('even an admin cannot update %s.%s', async (table, column) => {
    await actAs(db, 'admin');
    const value = column.endsWith('At') ? '2000-01-01' : '00000000-0000-4000-8000-00000000beef';
    await expectSqlError(db, `update public."${table}" set "${column}" = $1`, [value], SQLSTATE.insufficientPrivilege);
  });
});

describe('timetable integrity (Phase 6, migration 11)', () => {
  const insertEntry = 'insert into public."timetableEntries" ("classId", "subjectId", "teacherId", "dayOfWeek", "startTime", "endTime") values ($1, $2, $3, $4, $5, $6) returning id, "academicYearId"';
  const maths = ids.subject.maths;
  const science = ids.subject.science;
  const seedEntry = async (classId: string, subjectId: string, teacherId: string | null, day: number, start: string, end: string) => {
    await actAsOwner(db);
    return (await db.query(insertEntry, [classId, subjectId, teacherId, day, start, end])).rows[0].id as string;
  };

  it('teachers and students cannot create entries, even for their own class', async () => {
    await actAs(db, 'teacherA');
    await expectSqlError(db, insertEntry, [cls.tenA, maths, ids.teacher.a, 1, '09:00', '09:45'], SQLSTATE.insufficientPrivilege);
    await actAs(db, 'studentA');
    await expectSqlError(db, insertEntry, [cls.tenA, maths, null, 1, '09:00', '09:45'], SQLSTATE.insufficientPrivilege);
  });

  it('teachers cannot update or delete entries, including their own periods', async () => {
    const id = await seedEntry(cls.tenA, maths, ids.teacher.a, 1, '09:00', '09:45');
    await actAs(db, 'teacherA');
    expect(await select('select id from public."timetableEntries" where id = $1', [id])).toEqual([id]);
    expect(await affected(db, 'update public."timetableEntries" set room = \'mine\' where id = $1', [id])).toBe(0);
    expect(await affected(db, 'delete from public."timetableEntries" where id = $1', [id])).toBe(0);
  });

  it('visibility: students their class, teachers their own periods and classes they teach', async () => {
    const tenA = await seedEntry(cls.tenA, maths, ids.teacher.a, 1, '09:00', '09:45');
    const tenB = await seedEntry(cls.tenB, science, ids.teacher.b, 1, '09:00', '09:45');
    const both = [tenA, tenB];
    await actAs(db, 'studentA');
    expect(await select('select id from public."timetableEntries" where id = any($1)', [both])).toEqual([tenA]);
    await actAs(db, 'studentB');
    expect(await select('select id from public."timetableEntries" where id = any($1)', [both])).toEqual([tenB]);
    await actAs(db, 'teacherA');
    expect(await select('select id from public."timetableEntries" where id = any($1)', [both])).toEqual([tenA]);
    await actAs(db, 'teacherB');
    expect(await select('select id from public."timetableEntries" where id = any($1)', [both])).toEqual([tenB]);
    await actAs(db, 'inactiveStudent');
    expect(await select('select id from public."timetableEntries" where id = any($1)', [both])).toEqual([]);
  });

  it('academicYearId is always derived from the class (a supplied value is overwritten)', async () => {
    await actAs(db, 'admin');
    const { rows } = await db.query(
      'insert into public."timetableEntries" ("classId", "subjectId", "dayOfWeek", "startTime", "endTime", "academicYearId") values ($1, $2, 2, \'09:00\', \'09:45\', $3) returning "academicYearId"',
      [cls.tenA, maths, '00000000-0000-4000-8000-00000000beef'],
    );
    expect(rows[0].academicYearId).toBe(ids.year);
  });

  it.each(['academicYearId', 'id', 'createdAt', 'updatedAt'])('even an admin cannot update timetableEntries.%s', async (column) => {
    const id = await seedEntry(cls.tenA, maths, null, 1, '09:00', '09:45');
    await actAs(db, 'admin');
    const value = column.endsWith('At') ? '2000-01-01' : '00000000-0000-4000-8000-00000000beef';
    await expectSqlError(db, `update public."timetableEntries" set "${column}" = $2 where id = $1`, [id, value], SQLSTATE.insufficientPrivilege);
  });

  it('overlapping class periods are rejected by the database (23P01); adjacent periods are allowed', async () => {
    await seedEntry(cls.tenA, maths, null, 1, '09:00', '09:45');
    await actAs(db, 'admin');
    await expectSqlError(db, insertEntry, [cls.tenA, science, null, 1, '09:44', '10:30'], '23P01');
    await expectSqlError(db, insertEntry, [cls.tenA, science, null, 1, '08:00', '12:00'], '23P01');
    expect((await db.query(insertEntry, [cls.tenA, science, null, 1, '09:45', '10:30'])).rowCount).toBe(1);
    expect((await db.query(insertEntry, [cls.tenA, science, null, 1, '08:15', '09:00'])).rowCount).toBe(1);
  });

  it('a teacher cannot be double-booked across classes in the same year; unstaffed periods are exempt', async () => {
    await actAsOwner(db);
    await db.query('insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values ($1, $2, $3)', [ids.teacher.a, cls.tenB, maths]);
    await seedEntry(cls.tenA, maths, ids.teacher.a, 3, '11:00', '11:45');
    await actAs(db, 'admin');
    await expectSqlError(db, insertEntry, [cls.tenB, maths, ids.teacher.a, 3, '11:30', '12:15'], '23P01');
    expect((await db.query(insertEntry, [cls.tenB, maths, null, 3, '11:30', '12:15'])).rowCount).toBe(1);
    // Assigning the teacher to that now-unstaffed period would double-book them.
    await expectSqlError(db, 'update public."timetableEntries" set "teacherId" = $1 where "classId" = $2 and "dayOfWeek" = 3', [ids.teacher.a, cls.tenB], '23P01');
  });

  it('a timetabled teacher must hold the matching class + subject assignment (23503)', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, insertEntry, [cls.tenA, science, ids.teacher.a, 4, '09:00', '09:45'], SQLSTATE.foreignKeyViolation);
  });

  it('inserts, updates and deletes are audited with the acting admin', async () => {
    await actAs(db, 'admin');
    const id = (await db.query(insertEntry, [cls.tenA, maths, null, 5, '09:00', '09:45'])).rows[0].id;
    await db.query('update public."timetableEntries" set room = \'R1\' where id = $1', [id]);
    await db.query('delete from public."timetableEntries" where id = $1', [id]);
    await actAsOwner(db);
    const { rows } = await db.query('select action, "actorUserId" from public."auditLogs" where "entityId" = $1 order by action', [id]); // one transaction: same timestamp
    expect(rows).toEqual([
      { action: 'timetableEntries.delete', actorUserId: user.admin },
      { action: 'timetableEntries.insert', actorUserId: user.admin },
      { action: 'timetableEntries.update', actorUserId: user.admin },
    ]);
  });
});

describe('notices workflow (Phase 6, migration 12)', () => {
  it('drafts, archived notices and other audiences stay invisible; recipients see published notices addressed to them', async () => {
    await actAsOwner(db);
    await db.query('update public.notices set status = \'archived\' where id = $1', [notice.allStudents]);
    await actAs(db, 'studentA');
    expect(await select('select id from public."notices" where id = any($1)', [Object.values(notice)])).toEqual([]);
    await actAs(db, 'studentB');
    expect(await select('select id from public."notices" where id = any($1)', [Object.values(notice)])).toEqual([notice.classTenB]);
    await actAs(db, 'teacherA'); // teaches 10-A only
    expect(await select('select id from public."notices" where id = any($1)', [Object.values(notice)])).toEqual([notice.teachersOnly]);
  });

  it('an admin cannot insert a notice that is already published, or set its id or author afterwards', async () => {
    await actAs(db, 'admin');
    await expectSqlError(
      db,
      'insert into public.notices (title, body, "createdByUserId", status, "publishedAt") values (\'x\', \'y\', $1, \'published\', now())',
      [user.admin],
      SQLSTATE.insufficientPrivilege,
    );
    for (const column of ['id', 'createdByUserId', 'createdAt', 'updatedAt']) {
      const value = column.endsWith('At') ? '2000-01-01' : user.teacherA;
      await expectSqlError(db, `update public.notices set "${column}" = $2 where id = $1`, [notice.draft, value], SQLSTATE.insufficientPrivilege);
    }
    await expectSqlError(db, 'update public."noticeAudiences" set "audienceRole" = \'teacher\' where "noticeId" = $1', [notice.draft], SQLSTATE.insufficientPrivilege);
  });

  it('audiences can be added or removed only while the notice is a draft', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, 'insert into public."noticeAudiences" ("noticeId", "audienceRole") values ($1, \'teacher\')', [notice.allStudents], SQLSTATE.insufficientPrivilege);
    expect(await affected(db, 'delete from public."noticeAudiences" where "noticeId" = $1', [notice.allStudents])).toBe(0);
    expect(await affected(db, 'insert into public."noticeAudiences" ("noticeId", "audienceRole") values ($1, \'teacher\')', [notice.draft])).toBe(1);
    expect(await affected(db, 'delete from public."noticeAudiences" where "noticeId" = $1', [notice.draft])).toBe(1);
  });

  it('status transitions: draft → published → archived; never back, never republished', async () => {
    await actAs(db, 'admin');
    const NOT_ALLOWED = '55000';
    await expectSqlError(db, 'update public.notices set status = \'draft\' where id = $1', [notice.allStudents], NOT_ALLOWED);
    await expectSqlError(db, 'update public.notices set title = \'edited\' where id = $1', [notice.allStudents], NOT_ALLOWED);
    await expectSqlError(db, 'update public.notices set "publishedAt" = now() - interval \'1 day\' where id = $1', [notice.allStudents], NOT_ALLOWED);
    expect(await affected(db, 'update public.notices set status = \'archived\' where id = $1', [notice.allStudents])).toBe(1);
    await db.query('update public.notices set status = \'archived\' where id = $1', [notice.allStudents]);
    await expectSqlError(db, 'update public.notices set status = \'published\' where id = $1', [notice.allStudents], NOT_ALLOWED);
    await expectSqlError(db, 'update public.notices set status = \'draft\' where id = $1', [notice.allStudents], NOT_ALLOWED);
    expect(await affected(db, 'update public.notices set title = \'edited draft\' where id = $1', [notice.draft])).toBe(1);
  });

  it('publishNotice needs an audience, stamps publishedAt and works only on drafts', async () => {
    await actAs(db, 'admin');
    await db.query('delete from public."noticeAudiences" where "noticeId" = $1', [notice.draft]);
    await expectSqlError(db, 'select public."publishNotice"($1)', [notice.draft], '55000');
    await db.query('select public."setNoticeAudiences"($1, \'[{"audienceRole": "student"}]\'::jsonb)', [notice.draft]);
    await db.query('select public."publishNotice"($1)', [notice.draft]);
    const { rows } = await db.query('select status, "publishedAt" <= now() as stamped from public.notices where id = $1', [notice.draft]);
    expect(rows).toEqual([{ status: 'published', stamped: true }]);
    await expectSqlError(db, 'select public."publishNotice"($1)', [notice.draft], '55000');
    await expectSqlError(db, 'select public."setNoticeAudiences"($1, \'[]\'::jsonb)', [notice.draft], '55000');
  });

  it('createNotice is atomic and records the caller as author', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, 'select public."createNotice"(\'IT atomic\', \'b\', null, $1::jsonb)', [JSON.stringify([{ audienceRole: 'student' }, { classId: '00000000-0000-4000-8000-00000000beef' }])], SQLSTATE.foreignKeyViolation);
    expect(await select('select id from public.notices where title = \'IT atomic\'')).toEqual([]);
    const id = (await db.query('select public."createNotice"(\'IT ok\', \'b\', null, $1::jsonb) as id', [JSON.stringify([{ classId: cls.tenA }])])).rows[0].id;
    const { rows } = await db.query('select status, "createdByUserId", (select count(*)::int from public."noticeAudiences" where "noticeId" = $1) as audiences from public.notices where id = $1', [id]);
    expect(rows).toEqual([{ status: 'draft', createdByUserId: user.admin, audiences: 1 }]);
  });

  it('teachers and students cannot call the notice functions', async () => {
    for (const who of ['teacherA', 'studentA'] as const) {
      await actAs(db, who);
      await expectSqlError(db, 'select public."createNotice"(\'x\', \'y\', null, \'[]\'::jsonb)', [], SQLSTATE.insufficientPrivilege);
      await expectSqlError(db, 'select public."publishNotice"($1)', [notice.draft], SQLSTATE.insufficientPrivilege);
      await expectSqlError(db, 'select public."setNoticeAudiences"($1, \'[]\'::jsonb)', [notice.draft], SQLSTATE.insufficientPrivilege);
    }
    await actAsAnon(db);
    await expectSqlError(db, 'select public."publishNotice"($1)', [notice.draft], SQLSTATE.insufficientPrivilege);
  });

  it('notice changes are audited', async () => {
    await actAs(db, 'admin');
    await db.query('update public.notices set title = \'audited\' where id = $1', [notice.draft]);
    await actAsOwner(db);
    const { rows } = await db.query('select action, "actorUserId", metadata from public."auditLogs" where "entityId" = $1 and action = \'notices.update\'', [notice.draft]);
    expect(rows).toEqual([{ action: 'notices.update', actorUserId: user.admin, metadata: { changedFields: ['title'] } }]);
  });
});
