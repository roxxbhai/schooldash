import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
} from "./helpers/db";
import { ids } from "./helpers/school";

/**
 * REAL Row Level Security tests against the Supabase project's database.
 * Each test seeds the fixture school in a transaction, acts as a real
 * Postgres role with real JWT claims, and rolls everything back.
 */

const TABLES = [
  "users", "students", "teachers", "academicYears", "classes", "studentEnrollments",
  "subjects", "teacherAssignments", "studentAttendance", "teacherAttendance", "exams",
  "examSubjects", "results", "timetableEntries", "notices", "noticeAudiences", "auditLogs",
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

describe("unauthenticated (anon role)", () => {
  it.each(TABLES)("cannot read %s", async (table) => {
    await actAsAnon(db);
    await expectSqlError(db, `select * from public."${table}" limit 1`, [], SQLSTATE.insufficientPrivilege);
  });

  it("cannot call RLS helpers or provisioning functions", async () => {
    await actAsAnon(db);
    await expectSqlError(db, `select app."isAdmin"()`, [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(
      db,
      `select public."provisionAppUser"($1, 'x@example.com', 'X', 'admin')`,
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
  });
});

describe("student", () => {
  beforeEach(async () => actAs(db, "studentA"));

  it("reads only their own user, student, enrollment, attendance and result rows", async () => {
    expect(await select(`select id from public."users"`)).toEqual([user.studentA]);
    expect(await select(`select id from public."students"`)).toEqual([student.a]);
    expect(await select(`select "studentId" from public."studentEnrollments"`)).toEqual([student.a]);
    expect(await select(`select id from public."studentAttendance"`)).toEqual([attendance.a]);
    expect(await select(`select id from public."results"`)).toEqual(sorted(result.aMaths, result.aScience));
  });

  it("cannot read another student's records even when filtering for them explicitly", async () => {
    expect(await select(`select id from public."students" where id = $1`, [student.b])).toEqual([]);
    expect(await select(`select id from public."results" where "studentId" = $1`, [student.b])).toEqual([]);
    expect(await select(`select id from public."studentAttendance" where "studentId" = $1`, [student.b])).toEqual([]);
    expect(await select(`select id from public."users" where id = $1`, [user.studentB])).toEqual([]);
  });

  it("sees only their own class and its exam papers", async () => {
    expect(await select(`select id from public."classes"`)).toEqual([cls.tenA]);
    expect(await select(`select id from public."examSubjects"`)).toEqual(
      sorted(examSubject.tenAMaths, examSubject.tenAScience),
    );
  });

  it("sees only published notices addressed to students or their class", async () => {
    // Scoped to fixture notices: real notices addressed to all students are legitimately visible too.
    expect(await select(`select id from public."notices" where id = any($1)`, [Object.values(notice)])).toEqual([notice.allStudents]);
  });

  it("cannot read audit logs or auth.users", async () => {
    expect(await select(`select id from public."auditLogs"`)).toEqual([]);
    await expectSqlError(db, `select id from auth.users`, [], SQLSTATE.insufficientPrivilege);
  });

  it("can update their own name and phone", async () => {
    expect(await affected(db, `update public."users" set "fullName" = 'New Name', phone = '123' where id = $1`, [user.studentA])).toBe(1);
  });

  it("cannot change their own role or active status (cannot self-promote)", async () => {
    await expectSqlError(db, `update public."users" set role = 'admin' where id = $1`, [user.studentA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `update public."users" set "isActive" = true where id = $1`, [user.studentA], SQLSTATE.insufficientPrivilege);
  });

  it("cannot create users or administrators", async () => {
    await expectSqlError(
      db,
      `insert into public."users" ("authUserId", email, "fullName", role) values ($1, 'x@example.com', 'X', 'admin')`,
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(
      db,
      `select public."provisionAppUser"($1, 'x@example.com', 'X', 'admin')`,
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot modify other people's data", async () => {
    expect(await affected(db, `update public."users" set "fullName" = 'Hacked' where id = $1`, [user.studentB])).toBe(0);
    expect(await affected(db, `update public."results" set "marksObtained" = 100 where id = $1`, [result.aMaths])).toBe(0);
    await expectSqlError(
      db,
      `insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, '2099-06-02', 'present', $3)`,
      [student.a, cls.tenA, user.studentA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot delete protected records", async () => {
    await expectSqlError(db, `delete from public."results" where id = $1`, [result.aMaths], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `delete from public."students" where id = $1`, [student.a], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `delete from public."auditLogs"`, [], SQLSTATE.insufficientPrivilege);
  });
});

describe("teacher", () => {
  it("reads attendance and students only for assigned classes", async () => {
    await actAs(db, "teacherA");
    expect(await select(`select id from public."studentAttendance"`)).toEqual([attendance.a]);
    expect(await select(`select id from public."students"`)).toEqual(sorted(student.a, student.inactive));
    expect(await select(`select id from public."classes"`)).toEqual([cls.tenA]);
  });

  it("reads results only for assigned class AND subject", async () => {
    await actAs(db, "teacherA"); // 10-A Maths only; 10-A Science has no teacher
    expect(await select(`select id from public."results"`)).toEqual([result.aMaths]);
  });

  it("sees user rows only for themselves and students they teach", async () => {
    await actAs(db, "teacherA");
    expect(await select(`select id from public."users"`)).toEqual(
      sorted(user.teacherA, user.studentA, user.inactiveStudent),
    );
  });

  it("can mark attendance for an assigned class as themselves", async () => {
    await actAs(db, "teacherA");
    expect(
      await affected(
        db,
        `insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, '2099-06-02', 'present', $3)`,
        [student.a, cls.tenA, user.teacherA],
      ),
    ).toBe(1);
  });

  it("cannot mark attendance for an unassigned class", async () => {
    await actAs(db, "teacherA");
    await expectSqlError(
      db,
      `insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, '2099-06-02', 'present', $3)`,
      [student.b, cls.tenB, user.teacherA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot record attendance in another user's name", async () => {
    await actAs(db, "teacherA");
    await expectSqlError(
      db,
      `insert into public."studentAttendance" ("studentId", "classId", "attendanceDate", status, "markedByUserId") values ($1, $2, '2099-06-02', 'present', $3)`,
      [student.a, cls.tenA, user.teacherB],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("can update results only for their own class + subject", async () => {
    await actAs(db, "teacherA");
    const update = `update public."results" set "marksObtained" = 90, "enteredByUserId" = $2 where id = $1`;
    expect(await affected(db, update, [result.aMaths, user.teacherA])).toBe(1);
    expect(await affected(db, update, [result.aScience, user.teacherA])).toBe(0); // same class, other subject
    expect(await affected(db, update, [result.bScience, user.teacherA])).toBe(0); // other class
  });

  it("cannot enter results for an unassigned subject in an assigned class", async () => {
    await actAs(db, "teacherA");
    await expectSqlError(
      db,
      `insert into public."results" ("examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values ($1, $2, $3, 50, $4)`,
      [examSubject.tenAScience, student.inactive, cls.tenA, user.teacherA],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("cannot move a row into an unassigned class via UPDATE", async () => {
    await actAs(db, "teacherA");
    await expectSqlError(
      db,
      `update public."studentAttendance" set "classId" = $2 where id = $1`,
      [attendance.a, cls.tenB],
      SQLSTATE.insufficientPrivilege,
    );
  });

  it("as class teacher, sees their class and notices addressed to it", async () => {
    await actAs(db, "teacherB");
    expect(await select(`select id from public."classes"`)).toEqual([cls.tenB]);
    expect(await select(`select id from public."notices" where id = any($1)`, [Object.values(notice)])).toEqual(
      sorted(notice.classTenB, notice.teachersOnly),
    );
  });

  it("cannot read audit logs", async () => {
    await actAs(db, "teacherA");
    expect(await select(`select id from public."auditLogs"`)).toEqual([]);
  });
});

describe("administrator", () => {
  beforeEach(async () => actAs(db, "admin"));

  it("reads school-wide data, including drafts and audit logs", async () => {
    // Scoped to fixture rows so the assertions hold once the project has real data.
    const fixtureStudents = [student.a, student.b, student.inactive];
    const fixtureResults = Object.values(result);
    const fixtureNotices = Object.values(notice); // includes the draft
    expect(await select(`select id from public."students" where id = any($1)`, [fixtureStudents])).toEqual(sorted(...fixtureStudents));
    expect(await select(`select id from public."results" where id = any($1)`, [fixtureResults])).toEqual(sorted(...fixtureResults));
    expect(await select(`select id from public."notices" where id = any($1)`, [fixtureNotices])).toEqual(sorted(...fixtureNotices));
    expect((await select(`select id from public."auditLogs"`)).length).toBeGreaterThan(0);
  });

  it("can create reference data and edit profile details", async () => {
    expect(await affected(db, `insert into public."subjects" (code, name) values ('IT-ART', 'Art')`)).toBe(1);
    expect(await affected(db, `update public."users" set "fullName" = 'Renamed' where id = $1`, [user.studentB])).toBe(1);
  });

  it("cannot change roles or account status through the API (provisioning service only)", async () => {
    await expectSqlError(db, `update public."users" set role = 'admin' where id = $1`, [user.teacherA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `update public."users" set "isActive" = false where id = $1`, [user.teacherA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `update public."users" set role = 'student' where id = $1`, [user.admin], SQLSTATE.insufficientPrivilege);
  });

  it("cannot create users directly or delete historical records", async () => {
    await expectSqlError(
      db,
      `insert into public."users" ("authUserId", email, "fullName", role) values ($1, 'x@example.com', 'X', 'admin')`,
      [ids.auth.unprovisioned],
      SQLSTATE.insufficientPrivilege,
    );
    await expectSqlError(db, `delete from public."results" where id = $1`, [result.aMaths], SQLSTATE.insufficientPrivilege);
  });

  it("cannot alter audit logs", async () => {
    await expectSqlError(db, `update public."auditLogs" set action = 'x'`, [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `delete from public."auditLogs"`, [], SQLSTATE.insufficientPrivilege);
  });
});

describe("deactivated and unprovisioned identities", () => {
  it("a deactivated user can read only their own users row (to learn their status)", async () => {
    await actAs(db, "inactiveStudent");
    expect(await select(`select id from public."users"`)).toEqual([user.inactiveStudent]);
    for (const table of ["students", "results", "studentAttendance", "notices", "classes", "subjects", "teachers"]) {
      expect(await select(`select id from public."${table}"`), table).toEqual([]);
    }
  });

  it("a deactivated user cannot reactivate themselves", async () => {
    await actAs(db, "inactiveStudent");
    await expectSqlError(db, `update public."users" set "isActive" = true where id = $1`, [user.inactiveStudent], SQLSTATE.insufficientPrivilege);
  });

  it("an Auth identity without an application account sees nothing", async () => {
    await actAs(db, "unprovisioned");
    for (const table of TABLES) {
      expect(await select(`select id from public."${table}"`), table).toEqual([]);
    }
  });
});

describe("defense in depth (database owner paths)", () => {
  it("the self-privilege trigger blocks role changes for the signed-in user even without column grants", async () => {
    await actAsOwner(db);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: ids.auth.studentA, role: "authenticated" }),
    ]);
    await expectSqlError(db, `update public."users" set role = 'admin' where id = $1`, [user.studentA], SQLSTATE.insufficientPrivilege);
  });

  it("audit logs are append-only even for the database owner", async () => {
    await actAsOwner(db);
    await expectSqlError(db, `update public."auditLogs" set action = 'tampered'`, [], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, `delete from public."auditLogs"`, [], SQLSTATE.insufficientPrivilege);
  });
});
