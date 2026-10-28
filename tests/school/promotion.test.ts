import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE CLASS PROMOTION ROUTES: REAL HANDLERS, A RECORDING FAKE DATABASE
// CLIENT AND STUBBED GUARDS. THE DATABASE FUNCTIONS THEMSELVES (WHO MAY PROMOTE, SKIPS,
// ROLL CONFLICTS, GRADUATION) ARE COVERED BY tests/integration/promotion.test.ts.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
}));

import * as graduate from '@/app/api/classes/[id]/graduate/route';
import * as promote from '@/app/api/classes/[id]/promote/route';
import * as promotion from '@/app/api/classes/[id]/promotion/route';
import { todayInSchool } from '@/helpers/format';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLASS = ID(40);
const TARGET = ID(41);
const admin = makeUser('ADMIN', ID(1));
const teacher = makeUser('TEACHER', ID(2));
const student = makeUser('STUDENT', ID(3));
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

const params = { id: CLASS };
const sendPromote = (body: object) => callRoute(promote.POST, { params, body });
const sendGraduate = (body: object) => callRoute(graduate.POST, { params, body });

describe('GET /api/classes/[id]/promotion', () => {
  it('returns the options for admins and teachers (the database decides which teacher), never for students', async () => {
    const options = { classes: [{ id: TARGET, academicYearId: ID(50), name: '6', section: 'A' }], moves: [], takenRollNumbers: [] };
    db.respondTo('classPromotionOptions.rpc', { data: options }, { error: { code: '42501', message: 'only administrators and the class teacher can promote a class' } });
    expect((await callRoute(promotion.GET, { params })).body.data).toEqual(options);
    expect(db.callsTo('classPromotionOptions', 'rpc')[0].payload).toEqual({ classId: CLASS });

    actAs(teacher);
    expect((await callRoute(promotion.GET, { params })).status).toBe(403);

    actAs(student);
    expect((await callRoute(promotion.GET, { params })).status).toBe(403);
  });
});

describe('POST /api/classes/[id]/promote', () => {
  it('sends every student with their roll number to the one database function', async () => {
    db.respondTo('promoteStudents.rpc', {
      data: { status: 'promoted', promoted: [{ studentId: ID(30), enrollmentId: ID(60) }], skipped: [{ studentId: ID(31), reason: 'inactive' }] },
    });
    const students = [
      { studentId: ID(30), rollNumber: 4 },
      { studentId: ID(31), rollNumber: null },
    ];
    const result = await sendPromote({ targetClassId: TARGET, students });
    expect(result.status).toBe(200);
    expect(db.callsTo('promoteStudents', 'rpc')[0].payload).toEqual({ sourceClassId: CLASS, targetClassId: TARGET, students });
    expect(result.body.data).toEqual({ promoted: [{ studentId: ID(30), enrollmentId: ID(60) }], skipped: [{ studentId: ID(31), reason: 'inactive' }] });
  });

  it('reports a taken roll number on that student, by position', async () => {
    db.respondTo('promoteStudents.rpc', { data: { status: 'rollConflicts', conflicts: [{ studentId: ID(31), rollNumber: 2 }] } });
    const result = await sendPromote({
      targetClassId: TARGET,
      students: [
        { studentId: ID(30), rollNumber: 1 },
        { studentId: ID(31), rollNumber: 2 },
      ],
    });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'students.1.rollNumber', message: 'Roll number 2 is already taken in that class.' }]]);
  });

  it('rejects malformed requests before calling the database', async () => {
    const one = { studentId: ID(30), rollNumber: 1 };
    for (const body of [
      { targetClassId: TARGET, students: [] },
      { targetClassId: 'nope', students: [one] },
      { targetClassId: TARGET, students: [one, one] },
      { targetClassId: TARGET, students: [{ studentId: ID(30), rollNumber: 0 }] },
      { targetClassId: TARGET, students: [{ studentId: ID(30) }] },
      { targetClassId: TARGET, students: [one], academicYearId: ID(50) },
    ]) {
      expect((await sendPromote(body)).status, JSON.stringify(body)).toBe(422);
    }
    actAs(student);
    expect((await sendPromote({ targetClassId: TARGET, students: [one] })).status).toBe(403);
    expect(db.callsTo('promoteStudents')).toHaveLength(0);
  });

  it('maps the database refusals to clear errors', async () => {
    db.respondTo(
      'promoteStudents.rpc',
      { error: { code: '22023', message: 'students can only move to a later academic year (constraint "promotionTargetLaterYear")' } },
      { error: { code: '42501', message: 'only administrators and the class teacher can promote a class' } },
      { error: { code: '23505', message: 'duplicate key value violates unique constraint "studentEnrollmentsStudentYearKey"' } },
    );
    const body = { targetClassId: TARGET, students: [{ studentId: ID(30), rollNumber: null }] };
    const laterYear = await sendPromote(body);
    expect([laterYear.status, laterYear.body.error?.details]).toEqual([422, [{ path: 'targetClassId', message: 'Choose a class in a later academic year.' }]]);
    expect((await sendPromote(body)).status).toBe(403);
    expect((await sendPromote(body)).status).toBe(409);
  });
});

describe('POST /api/classes/[id]/graduate', () => {
  it("graduates the students as of today's school date", async () => {
    db.respondTo('graduateStudents.rpc', { data: { status: 'graduated', graduated: [ID(30)], skipped: [{ studentId: ID(31), reason: 'alreadyGraduated' }] } });
    const result = await sendGraduate({ studentIds: [ID(30), ID(31)] });
    expect(result.status).toBe(200);
    expect(db.callsTo('graduateStudents', 'rpc')[0].payload).toEqual({ sourceClassId: CLASS, studentIds: [ID(30), ID(31)], graduatedOn: todayInSchool() });
    expect(result.body.data).toEqual({ graduated: [ID(30)], skipped: [{ studentId: ID(31), reason: 'alreadyGraduated' }] });
  });

  it('rejects empty or repeated lists, and anyone but admins and teachers', async () => {
    expect((await sendGraduate({ studentIds: [] })).status).toBe(422);
    expect((await sendGraduate({ studentIds: [ID(30), ID(30)] })).status).toBe(422);
    actAs(student);
    expect((await sendGraduate({ studentIds: [ID(30)] })).status).toBe(403);
    expect(db.callsTo('graduateStudents')).toHaveLength(0);
  });
});
