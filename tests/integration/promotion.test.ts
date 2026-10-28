import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLSTATE, actAs, actAsOwner, beginSeeded, connect, expectSqlError, rollback } from './helpers/db';
import { ids } from './helpers/school';

/**
 * REAL tests of class promotion and graduation (migration 20) against the
 * Supabase project's database. Each test seeds the fixture school in a
 * transaction, adds a later academic year as the owner, acts as real roles
 * and rolls everything back.
 *
 * Fixture: 10-A has student A (roll 1) and the inactive student (roll 2), no
 * class teacher; teacher A teaches maths there. 10-B has student B (roll 1)
 * and teacher B as its class teacher.
 */

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const later = {
  year: id('f0000001', 1),
  elevenA: id('f0000002', 1),
  elevenB: id('f0000002', 2),
  twelveA: id('f0000002', 3),
  graduate: { auth: id('f0000003', 1), user: id('f0000004', 1), student: id('f0000005', 1) },
};

let db: pg.Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await beginSeeded(db);
  await db.query('insert into public."academicYears" ("id", "name", "startDate", "endDate") values ($1, \'IT-FIXTURE-NEXT\', \'2016-04-01\', \'2017-03-31\')', [later.year]);
  await db.query('insert into public."classes" ("id", "academicYearId", "name", "section") values ($1, $3, \'11\', \'A\'), ($2, $3, \'11\', \'B\')', [
    later.elevenA,
    later.elevenB,
    later.year,
  ]);
});
afterEach(async () => {
  await rollback(db);
});

async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T> {
  const result = await db.query(sql, params);
  return Object.values(result.rows[0])[0] as T;
}

const options = (classId: string) => rpc('select public."classPromotionOptions"($1) as r', [classId]);
const promote = (source: string, target: string, students: object[]) =>
  rpc('select public."promoteStudents"($1, $2, $3::jsonb) as r', [source, target, JSON.stringify(students)]);

describe('who can promote', () => {
  it('admins and the class teacher can; other teachers and students cannot', async () => {
    await actAs(db, 'teacherA'); // TEACHES 10-A BUT IS NOT ITS CLASS TEACHER
    await expectSqlError(db, 'select public."classPromotionOptions"($1)', [ids.class.tenA], SQLSTATE.insufficientPrivilege);
    await expectSqlError(db, 'select public."promoteStudents"($1, $2, \'[]\'::jsonb)', [ids.class.tenA, later.elevenA], SQLSTATE.insufficientPrivilege);
    await actAs(db, 'studentA');
    await expectSqlError(db, 'select public."classPromotionOptions"($1)', [ids.class.tenA], SQLSTATE.insufficientPrivilege);

    await actAs(db, 'teacherB'); // CLASS TEACHER OF 10-B
    expect(await options(ids.class.tenB)).toMatchObject({ moves: [] });
    await expectSqlError(db, 'select public."classPromotionOptions"($1)', [ids.class.tenA], SQLSTATE.insufficientPrivilege);
  });

  it("shows a class teacher the later year's classes they otherwise can't see", async () => {
    await actAs(db, 'teacherB');
    const result = await options(ids.class.tenB);
    const classIds = (result.classes as { id: string }[]).map((schoolClass) => schoolClass.id);
    expect(classIds).toEqual(expect.arrayContaining([later.elevenA, later.elevenB]));
    expect(classIds).not.toContain(ids.class.tenA);
  });
});

describe('promoting', () => {
  it('enrolls the students in the later class, keeping roll numbers, and reports where they moved', async () => {
    await actAs(db, 'teacherB');
    const result = await promote(ids.class.tenB, later.elevenB, [{ studentId: ids.student.b, rollNumber: 1 }]);
    expect(result).toMatchObject({ status: 'promoted', skipped: [], promoted: [{ studentId: ids.student.b }] });

    await actAsOwner(db);
    const enrollment = await db.query('select "classId", "academicYearId", "rollNumber" from public."studentEnrollments" where "studentId" = $1 and "academicYearId" = $2', [ids.student.b, later.year]);
    expect(enrollment.rows).toEqual([{ classId: later.elevenB, academicYearId: later.year, rollNumber: 1 }]);
    // THE OLD ENROLLMENT STAYS AS HISTORY.
    expect((await db.query('select 1 from public."studentEnrollments" where "studentId" = $1 and "classId" = $2', [ids.student.b, ids.class.tenB])).rowCount).toBe(1);
    expect((await db.query('select 1 from public."auditLogs" where "action" = \'classes.promote\' and "entityId" = $1', [ids.class.tenB])).rowCount).toBe(1);

    await actAs(db, 'teacherB');
    // THE DATABASE MAY HOLD OTHER (REAL) YEARS AFTER THE FIXTURE YEAR, SO ONLY THE FIXTURE CLASSES ARE CHECKED.
    const after = (await options(ids.class.tenB)) as { moves: unknown[]; takenRollNumbers: { classId: string }[] };
    expect(after.moves).toEqual([{ studentId: ids.student.b, classId: later.elevenB, academicYearId: later.year }]);
    expect(after.takenRollNumbers.filter((taken) => taken.classId === later.elevenB || taken.classId === later.elevenA)).toEqual([
      { classId: later.elevenB, rollNumber: 1 },
    ]);
  });

  it('skips students already enrolled in the target year and inactive students', async () => {
    await actAs(db, 'teacherB');
    await promote(ids.class.tenB, later.elevenB, [{ studentId: ids.student.b, rollNumber: null }]);
    expect(await promote(ids.class.tenB, later.elevenA, [{ studentId: ids.student.b, rollNumber: null }])).toEqual({
      status: 'promoted',
      promoted: [],
      skipped: [{ studentId: ids.student.b, reason: 'alreadyEnrolled', classId: later.elevenB }],
    });

    await actAs(db, 'admin');
    const result = await promote(ids.class.tenA, later.elevenA, [
      { studentId: ids.student.a, rollNumber: 1 },
      { studentId: ids.student.inactive, rollNumber: 2 },
    ]);
    expect(result).toMatchObject({ status: 'promoted', promoted: [{ studentId: ids.student.a }], skipped: [{ studentId: ids.student.inactive, reason: 'inactive' }] });
  });

  it('reports roll numbers that are taken or repeated, and writes nothing', async () => {
    await actAs(db, 'admin');
    await promote(ids.class.tenB, later.elevenB, [{ studentId: ids.student.b, rollNumber: 1 }]);
    expect(await promote(ids.class.tenA, later.elevenB, [{ studentId: ids.student.a, rollNumber: 1 }])).toEqual({
      status: 'rollConflicts',
      conflicts: [{ studentId: ids.student.a, rollNumber: 1 }],
    });
    await actAsOwner(db);
    expect((await db.query('select 1 from public."studentEnrollments" where "studentId" = $1 and "academicYearId" = $2', [ids.student.a, later.year])).rowCount).toBe(0);
  });

  it('refuses a target in the same or an earlier year, students outside the class, and repeats', async () => {
    await actAs(db, 'admin');
    const call = 'select public."promoteStudents"($1, $2, $3::jsonb)';
    const invalid = '22023';
    await expectSqlError(db, call, [ids.class.tenA, ids.class.tenB, JSON.stringify([{ studentId: ids.student.a }])], invalid);
    await expectSqlError(db, call, [ids.class.tenA, later.elevenA, JSON.stringify([{ studentId: ids.student.b }])], invalid);
    await expectSqlError(db, call, [ids.class.tenA, later.elevenA, JSON.stringify([{ studentId: ids.student.a }, { studentId: ids.student.a }])], invalid);
    await expectSqlError(db, call, [ids.class.tenA, later.elevenA, '[]'], invalid);
    await expectSqlError(db, call, [ids.class.tenA, ids.year, JSON.stringify([{ studentId: ids.student.a }])], invalid);
  });
});

describe('graduating', () => {
  beforeEach(async () => {
    // A CLASS 12 IN THE FIXTURE YEAR WITH ONE ACTIVE STUDENT, CLASS TEACHER B.
    const { auth, user, student } = later.graduate;
    await db.query('insert into auth.users (id, email, aud, role) values ($1, \'it-graduate@example.com\', \'authenticated\', \'authenticated\')', [auth]);
    await db.query('insert into public."users" ("id", "authUserId", "email", "fullName", "role") values ($1, $2, \'it-graduate@example.com\', \'IT graduate\', \'student\')', [user, auth]);
    await db.query('insert into public."students" ("id", "userId", "admissionNumber") values ($1, $2, \'IT-ADM-G\')', [student, user]);
    await db.query('insert into public."classes" ("id", "academicYearId", "name", "section", "classTeacherId") values ($1, $2, \'12\', \'A\', $3)', [later.twelveA, ids.year, ids.teacher.b]);
    await db.query('insert into public."studentEnrollments" ("studentId", "classId", "academicYearId", "rollNumber") values ($1, $2, $3, 1)', [student, later.twelveA, ids.year]);
  });

  const graduate = (classId: string, studentIds: string[]) =>
    rpc('select public."graduateStudents"($1, $2::uuid[], \'2016-03-31\') as r', [classId, studentIds]);

  it('marks the class teacher\'s class 12 students graduated and deactivates their accounts', async () => {
    await actAs(db, 'teacherB');
    expect(await graduate(later.twelveA, [later.graduate.student])).toEqual({ status: 'graduated', graduated: [later.graduate.student], skipped: [] });

    await actAsOwner(db);
    const row = await db.query(
      'select s."graduatedOn"::text as "graduatedOn", u."isActive", u."deactivatedAt" is not null as "isDeactivated" from public."students" s join public."users" u on u."id" = s."userId" where s."id" = $1',
      [later.graduate.student],
    );
    expect(row.rows).toEqual([{ graduatedOn: '2016-03-31', isActive: false, isDeactivated: true }]);
    expect((await db.query('select 1 from public."auditLogs" where "action" = \'students.graduate\' and "entityId" = $1', [later.graduate.student])).rowCount).toBe(1);

    await actAs(db, 'teacherB');
    expect(await graduate(later.twelveA, [later.graduate.student])).toEqual({
      status: 'graduated',
      graduated: [],
      skipped: [{ studentId: later.graduate.student, reason: 'alreadyGraduated' }],
    });
  });

  it('skips a student held back (already enrolled in a later year)', async () => {
    await db.query('insert into public."classes" ("id", "academicYearId", "name", "section") values ($1, $2, \'12\', \'A\')', [id('f0000002', 9), later.year]);
    await actAs(db, 'admin');
    await promote(later.twelveA, id('f0000002', 9), [{ studentId: later.graduate.student, rollNumber: null }]);
    expect(await graduate(later.twelveA, [later.graduate.student])).toMatchObject({ graduated: [], skipped: [{ reason: 'enrolledLater' }] });
  });

  it('only graduates class 12, and only for admins or its class teacher', async () => {
    await actAs(db, 'admin');
    await expectSqlError(db, 'select public."graduateStudents"($1, $2::uuid[], \'2016-03-31\')', [ids.class.tenA, [ids.student.a]], '22023');
    await actAs(db, 'teacherA');
    await expectSqlError(db, 'select public."graduateStudents"($1, $2::uuid[], \'2016-03-31\')', [later.twelveA, [later.graduate.student]], SQLSTATE.insufficientPrivilege);
  });
});
