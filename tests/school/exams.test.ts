import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE EXAM AND EXAM-PAPER ROUTES: REAL HANDLERS, A RECORDING
// FAKE DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
}));

import * as exams from '@/app/api/exams/route';
import * as exam from '@/app/api/exams/[id]/route';
import * as examSubjects from '@/app/api/exam-subjects/route';
import * as examSubject from '@/app/api/exam-subjects/[id]/route';
import { marksSchema } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const YEAR = { id: ID(1), startDate: '2023-04-01', endDate: '2024-03-31' };
const EXAM = { id: ID(2), academicYearId: ID(1), startDate: '2023-09-01', endDate: '2023-09-30' };
const PAPER = { id: ID(5), examId: ID(2), maxMarks: 100, passMarks: 35 };
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(makeUser('ADMIN', ID(99)));
});

/** THE YEAR, EXAM AND CLASS EVERY TEST STARTS FROM; THE FIRST QUEUED RESPONSE WINS. */
function seedSchool({ year = YEAR as unknown, examRow = EXAM as unknown, classRow = { id: ID(3), academicYearId: ID(1) } as unknown } = {}) {
  db.respondTo('academicYears.select', { data: year });
  db.respondTo('exams.select', { data: examRow });
  db.respondTo('classes.select', { data: classRow });
  for (const table of ['exams', 'examSubjects']) {
    db.respondTo(`${table}.insert`, { data: { id: ID(50) } });
    db.respondTo(`${table}.update`, { data: { id: ID(50) } });
  }
}

describe('marks values', () => {
  it('accept 0–9999.99 with at most two decimals', () => {
    for (const ok of [0, 1, 33.5, 33.33, 9999.99]) expect(marksSchema.safeParse(ok).success, String(ok)).toBe(true);
    for (const bad of [-1, 33.335, 10000, Number.NaN]) expect(marksSchema.safeParse(bad).success, String(bad)).toBe(false);
  });
});

describe('exams', () => {
  const createExam = (body: object) => callRoute(exams.POST, { body });

  it('rejects end before start and unknown fields', async () => {
    seedSchool();
    expect((await createExam({ academicYearId: ID(1), name: 'T1', startDate: '2023-09-10', endDate: '2023-09-01' })).status).toBe(422);
    expect((await createExam({ academicYearId: ID(1), name: 'T1', type: 'final' })).status).toBe(422);
  });

  it('requires an existing academic year (422) and dates inside it (422)', async () => {
    seedSchool({ year: null });
    const unknownYear = await createExam({ academicYearId: ID(9), name: 'T1' });
    expect([unknownYear.status, unknownYear.body.error?.details?.[0].path]).toEqual([422, 'academicYearId']);

    db = fakeDb();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
    seedSchool();
    const outside = await createExam({ academicYearId: ID(1), name: 'T1', startDate: '2023-01-01' });
    expect([outside.status, outside.body.error?.details?.[0].path]).toEqual([422, 'startDate']);
    expect(db.callsTo('exams', 'insert')).toHaveLength(0);
  });

  it('validates updates against the merged dates', async () => {
    seedSchool();
    const update = (body: object) => callRoute(exam.PATCH, { method: 'PATCH', params: { id: ID(2) }, body });
    expect((await update({ endDate: '2023-08-01' })).status).toBe(422); // BEFORE THE EXISTING START
    expect((await update({ startDate: null, endDate: null })).status).toBe(200);
    expect(db.callsTo('exams', 'update')[0].payload).toEqual({ startDate: null, endDate: null });
  });
});

describe('exam subjects', () => {
  const input = { examId: ID(2), classId: ID(3), subjectId: ID(4), maxMarks: 100 };
  const createPaper = (body: object) => callRoute(examSubjects.POST, { body });
  const updatePaper = (body: object) => callRoute(examSubject.PATCH, { method: 'PATCH', params: { id: ID(5) }, body });

  it('takes the academic year from the exam', async () => {
    seedSchool();
    expect((await createPaper(input)).status).toBe(201);
    expect(db.callsTo('examSubjects', 'insert')[0].payload).toMatchObject({ academicYearId: ID(1) });
  });

  it('rejects a class from another academic year', async () => {
    seedSchool({ classRow: { id: ID(3), academicYearId: ID(8) } });
    const result = await createPaper(input);
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'classId']);
  });

  it('reports missing exam/class as 422 on the field', async () => {
    seedSchool({ examRow: null });
    expect((await createPaper(input)).body.error?.details?.[0].path).toBe('examId');
    db = fakeDb();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
    seedSchool({ classRow: null });
    const missingClass = await createPaper(input);
    expect([missingClass.status, missingClass.body.error?.details?.[0].path]).toEqual([422, 'classId']);
  });

  it("keeps examDate within the exam's dates", async () => {
    seedSchool();
    const outside = await createPaper({ ...input, examDate: '2023-10-05' });
    expect([outside.status, outside.body.error?.details?.[0].path]).toEqual([422, 'examDate']);
    expect((await createPaper({ ...input, examDate: '2023-09-15' })).status).toBe(201);
    expect(db.callsTo('examSubjects', 'insert')).toHaveLength(1);
  });

  it('validates maxMarks and passMarks', async () => {
    for (const body of [{ ...input, maxMarks: 0 }, { ...input, passMarks: 101 }, { ...input, maxMarks: 50.555 }]) {
      expect((await createPaper(body)).status).toBe(422);
    }
  });

  it('refuses to lower maxMarks below an entered mark (409), allows it otherwise', async () => {
    seedSchool();
    db.respondTo('examSubjects.select', { data: PAPER });
    db.respondTo('results.select', { data: { marksObtained: 88 } });
    expect((await updatePaper({ maxMarks: 80 })).status).toBe(409);
    expect((await updatePaper({ maxMarks: 90 })).status).toBe(200);
    expect(db.callsTo('examSubjects', 'update')[0].payload).toEqual({ maxMarks: 90 });
  });

  it('rejects passMarks above the (new) maxMarks', async () => {
    seedSchool();
    db.respondTo('examSubjects.select', { data: PAPER });
    const result = await updatePaper({ maxMarks: 30 });
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'passMarks']);
  });
});

describe('list ordering ends with a unique column (stable pagination)', () => {
  it.each([
    ['exams', exams.GET, 'exams'],
    ['exam subjects', examSubjects.GET, 'examSubjects'],
  ])('%s', async (_name, handler, table) => {
    await callRoute(handler);
    expect(db.callsTo(table, 'select')[0].orders.at(-1)).toBe('id');
  });
});
