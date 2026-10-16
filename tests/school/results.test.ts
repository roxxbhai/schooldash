import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE RESULTS (MARKS) ROUTES: REAL HANDLERS, A RECORDING FAKE
// DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
  teachesClass: vi.fn(),
  requireStudentOwnership: vi.fn(async () => ({ success: true, message: '', data: null })),
}));

import * as results from '@/app/api/results/route';
import * as resultsBulk from '@/app/api/results/bulk/route';
import * as result from '@/app/api/results/[id]/route';
import { requireStudentOwnership, teachesClass } from '@/functions/authorization';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { okResult } from '../helpers/function-result';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = makeUser('ADMIN', ID(1));
const teacher = makeUser('TEACHER', ID(2));
const student = makeUser('STUDENT', ID(3));
const PAPER = { id: ID(10), classId: ID(20), subjectId: ID(30), maxMarks: 50 };
const S1 = ID(40);
const S2 = ID(41);
const NOW = '2026-10-15T17:00:00.123456+00:00';
const OUTAGE = { error: { message: 'fetch failed' } }; // NO CODE: SUPABASE UNREACHABLE
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

/** A PAPER WITH TWO ACTIVE, ENROLLED STUDENTS — UNLESS A TEST SAYS OTHERWISE. */
function seedPaper({ paper = PAPER as unknown, students = [{ id: S1, user: { isActive: true } }, { id: S2, user: { isActive: true } }] as unknown[], enrolled = [S1, S2] } = {}) {
  db.respondTo('examSubjects.select', paper === null ? { data: null } : { data: paper });
  db.respondTo('students.select', { data: students });
  db.respondTo('studentEnrollments.select', { data: enrolled.map((studentId) => ({ studentId })) });
  db.respondTo('results.insert', { data: [{ id: ID(60) }, { id: ID(61) }] });
}

const enter = (body: object) => callRoute(results.POST, { body });
const enterBulk = (body: object) => callRoute(resultsBulk.POST, { body });
const correct = (body: object) => callRoute(result.PATCH, { method: 'PATCH', params: { id: ID(60) }, body });

describe('input validation', () => {
  it('rejects client-supplied classId / enteredByUserId', async () => {
    for (const extra of [{ classId: ID(9) }, { enteredByUserId: ID(9) }]) {
      expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10, ...extra })).status).toBe(422);
    }
  });

  it('corrections must quote expectedUpdatedAt and change something', async () => {
    expect((await correct({ marksObtained: 10 })).status).toBe(422);
    expect((await correct({ expectedUpdatedAt: NOW })).status).toBe(422);
    expect((await correct({ marksObtained: 10, expectedUpdatedAt: 'yesterday' })).status).toBe(422);
    expect(db.calls).toHaveLength(0);
  });

  it('bulk: 1–200 records, no duplicate students', async () => {
    expect((await enterBulk({ examSubjectId: PAPER.id, records: [] })).status).toBe(422);
    const duplicate = await enterBulk({ examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 1 }, { studentId: S1, marksObtained: 2 }] });
    expect(duplicate.body.error?.details?.[0].path).toBe('records.1.studentId');
  });
});

describe('entering marks', () => {
  it('takes the class from the paper and records the actor; zero is a valid mark', async () => {
    seedPaper();
    expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 0 })).status).toBe(201);
    expect(db.callsTo('results', 'insert')[0].payload).toEqual([
      { examSubjectId: PAPER.id, studentId: S1, marksObtained: 0, classId: PAPER.classId, enteredByUserId: admin.id },
    ]);
  });

  it("requires the teacher to be assigned to the paper's class AND subject", async () => {
    seedPaper();
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(false));
    expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 })).status).toBe(403);
    expect(teachesClass).toHaveBeenCalledWith(db.client, teacher, { classId: PAPER.classId, subjectId: PAPER.subjectId });
    expect(db.callsTo('results', 'insert')).toHaveLength(0);
  });

  it('refuses students', async () => {
    actAs(student);
    expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 })).status).toBe(403);
  });

  it('a teacher targeting a paper they cannot see gets 403 (existence not revealed)', async () => {
    seedPaper({ paper: null });
    actAs(teacher);
    expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 })).status).toBe(403);
  });

  it('REGRESSION: an outage while looking up the paper is a 503 for teachers, not a misleading 403', async () => {
    db.respondTo('examSubjects.select', OUTAGE);
    actAs(teacher);
    expect((await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 })).status).toBe(503);
  });

  it('reports an unknown paper as 422 on examSubjectId', async () => {
    seedPaper({ paper: null });
    const unknown = await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 10 });
    expect([unknown.status, unknown.body.error?.details]).toEqual([422, [{ path: 'examSubjectId', message: 'Exam subject not found.' }]]);
  });

  it.each([
    ['marks above maxMarks', { marksObtained: 50.01 }, {}, 'marksObtained'],
    ['an unknown student', {}, { students: [] }, 'studentId'],
    ['a deactivated student', {}, { students: [{ id: S1, user: { isActive: false } }] }, 'studentId'],
    ['a student not enrolled in the paper\'s class', {}, { enrolled: [] }, 'studentId'],
  ])('rejects %s (422) without writing', async (_label, override, seed, path) => {
    seedPaper(seed);
    const rejected = await enter({ examSubjectId: PAPER.id, studentId: S1, marksObtained: 20, ...override });
    expect([rejected.status, rejected.body.error?.details?.map((issue) => issue.path)]).toEqual([422, [path]]);
    expect(db.callsTo('results', 'insert')).toHaveLength(0);
  });

  it('bulk: reports every invalid record by index and writes nothing; otherwise one insert', async () => {
    seedPaper();
    const invalid = await enterBulk({ examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 10 }, { studentId: S2, marksObtained: 99 }] });
    expect([invalid.status, invalid.body.error?.details?.map((issue) => issue.path)]).toEqual([422, ['records.1.marksObtained']]);
    expect(db.callsTo('results', 'insert')).toHaveLength(0);

    const saved = await enterBulk({ examSubjectId: PAPER.id, records: [{ studentId: S1, marksObtained: 10 }, { studentId: S2, marksObtained: 0 }] });
    expect(db.callsTo('results', 'insert')).toHaveLength(1);
    expect(saved.body.data.count).toBe(2);
  });
});

describe('correcting marks (optimistic concurrency)', () => {
  const EXISTING = { id: ID(60), examSubjectId: PAPER.id, updatedAt: NOW };

  beforeEach(() => {
    db.respondTo('examSubjects.select', { data: PAPER });
  });

  it('applies the change only if updatedAt still matches; records the editor', async () => {
    db.respondTo('results.select', { data: EXISTING });
    db.respondTo('results.update', { data: { id: ID(60) } });
    expect((await correct({ marksObtained: 45, expectedUpdatedAt: NOW })).status).toBe(200);
    const update = db.callsTo('results', 'update')[0];
    expect(update.payload).toEqual({ marksObtained: 45, enteredByUserId: admin.id });
    expect(update.filters).toEqual([['eq', 'id', ID(60)], ['eq', 'updatedAt', NOW]]);
  });

  it('a stale write is a 409, not a silent overwrite', async () => {
    db.respondTo('results.select', { data: EXISTING });
    db.respondTo('results.update', { data: null });
    expect((await correct({ marksObtained: 45, expectedUpdatedAt: NOW })).status).toBe(409);
  });

  it('a result that vanished between read and write is a 404', async () => {
    db.respondTo('results.select', { data: EXISTING }, { data: null });
    db.respondTo('results.update', { data: null });
    expect((await correct({ marksObtained: 45, expectedUpdatedAt: NOW })).status).toBe(404);
  });

  it('REGRESSION: an outage during the re-read is a 503, not a misleading 404', async () => {
    db.respondTo('results.select', { data: EXISTING }, OUTAGE);
    db.respondTo('results.update', { data: null });
    expect((await correct({ marksObtained: 45, expectedUpdatedAt: NOW })).status).toBe(503);
  });

  it('rejects marks above maxMarks before writing', async () => {
    db.respondTo('results.select', { data: EXISTING });
    expect((await correct({ marksObtained: 51, expectedUpdatedAt: NOW })).status).toBe(422);
    expect(db.callsTo('results', 'update')).toHaveLength(0);
  });
});

describe('reading marks', () => {
  it("a student asking for another student's marks gets an ownership check", async () => {
    actAs(student);
    await callRoute(results.GET, { path: `/api/results?studentId=${S2}` });
    expect(requireStudentOwnership).toHaveBeenCalledWith(db.client, S2);
  });

  it('the list ends its ordering with a unique column (stable pagination)', async () => {
    await callRoute(results.GET);
    expect(db.callsTo('results', 'select')[0].orders.at(-1)).toBe('id');
  });
});
