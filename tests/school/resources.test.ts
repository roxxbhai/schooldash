import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE ACADEMIC-YEAR, SUBJECT AND CLASS ROUTES: REAL HANDLERS, A
// RECORDING FAKE DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
}));

import * as academicYears from '@/app/api/academic-years/route';
import * as academicYear from '@/app/api/academic-years/[id]/route';
import * as classes from '@/app/api/classes/route';
import * as schoolClass from '@/app/api/classes/[id]/route';
import * as subjects from '@/app/api/subjects/route';
import * as subject from '@/app/api/subjects/[id]/route';
import { requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const UUID = '3f2b8c1e-9d4a-4f6b-8e2c-1a7d5b9c0e3f';
const admin = makeUser('ADMIN', '00000000-0000-4000-8000-000000000001');
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

function postYear(body: unknown) {
  return callRoute(academicYears.POST, { body });
}

describe('academic year validation', () => {
  it('accepts a valid year and rejects end before start', async () => {
    db.respondTo('academicYears.insert', { data: { id: UUID } });
    expect((await postYear({ name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' })).status).toBe(201);
    const bad = await postYear({ name: 'x', startDate: '2027-01-01', endDate: '2026-01-01' });
    expect([bad.status, bad.body.error?.details?.[0].path]).toEqual([422, 'endDate']);
  });

  it('rejects isCurrent and unknown fields (current year changes only via set-current)', async () => {
    expect((await postYear({ name: 'x', startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: true })).status).toBe(422);
    expect((await callRoute(academicYear.PATCH, { method: 'PATCH', body: { isCurrent: true }, params: { id: UUID } })).status).toBe(422);
  });

  it('rejects invalid dates', async () => {
    expect((await postYear({ name: 'x', startDate: '2026-02-30', endDate: '2026-12-31' })).status).toBe(422);
    expect(db.callsTo('academicYears', 'insert')).toHaveLength(0);
  });
});

describe('requireChanges', () => {
  it('rejects an empty update with 422 and drops undefined fields', () => {
    expect(() => requireChanges({})).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => requireChanges({ name: undefined })).toThrow(expect.objectContaining({ status: 422 }));
    expect(requireChanges({ name: 'A', section: undefined, roomNumber: null })).toEqual({ name: 'A', roomNumber: null });
  });
});

describe('subjects', () => {
  it('stores names trimmed, single-spaced and upper-case', async () => {
    db.respondTo('subjects.insert', { data: { id: UUID } });
    db.respondTo('subjects.update', { data: { id: UUID } });
    await callRoute(subjects.POST, { body: { name: '  social \t  science   10 ' } });
    expect(db.callsTo('subjects', 'insert')[0].payload).toEqual({ name: 'SOCIAL SCIENCE 10' });
    await callRoute(subject.PATCH, { method: 'PATCH', body: { name: ' hindi  ' }, params: { id: UUID } });
    expect(db.callsTo('subjects', 'update')[0].payload).toEqual({ name: 'HINDI' });
  });

  it('rejects special characters and blank names', async () => {
    for (const name of ['Maths & Science', 'ENG-10', 'art.', 'C++', '   ', '']) {
      expect((await callRoute(subjects.POST, { body: { name } })).status, name).toBe(422);
    }
    expect((await callRoute(subject.PATCH, { method: 'PATCH', body: { name: 'a/b' }, params: { id: UUID } })).status).toBe(422);
    expect(db.callsTo('subjects', 'insert')).toHaveLength(0);
    expect(db.callsTo('subjects', 'update')).toHaveLength(0);
  });

  it('never accepts a subject code: the database generates it', async () => {
    expect((await callRoute(subjects.POST, { body: { code: 'MATH', name: 'Maths' } })).status).toBe(422);
    expect((await callRoute(subject.PATCH, { method: 'PATCH', body: { code: 'MATH' }, params: { id: UUID } })).status).toBe(422);
    expect(db.callsTo('subjects', 'insert')).toHaveLength(0);
    expect(db.callsTo('subjects', 'update')).toHaveLength(0);
  });

  it('clears blank descriptions to null', async () => {
    db.respondTo('subjects.insert', { data: { id: UUID } });
    await callRoute(subjects.POST, { body: { name: 'B', description: '  ' } });
    expect(db.callsTo('subjects', 'insert')[0].payload).toMatchObject({ description: null });
  });

  it('restricts search terms so they cannot inject PostgREST filter syntax', async () => {
    for (const bad of ['a,b', 'x)', 'name.eq.y,code', 'a(b']) {
      expect((await callRoute(subjects.GET, { path: `/api/subjects?search=${encodeURIComponent(bad)}` })).status, bad).toBe(400);
    }
    expect((await callRoute(subjects.GET, { path: '/api/subjects?search=Social%20Sci-10' })).status).toBe(200);
  });

  it('returns items with pagination metadata', async () => {
    db.respondTo('subjects.select', { data: [{ id: 's' }], count: 41 });
    const result = await callRoute(subjects.GET, { path: '/api/subjects?page=2&limit=20' });
    expect(result.body.data).toEqual({ items: [{ id: 's' }], pagination: { page: 2, limit: 20, total: 41, totalPages: 3 } });
  });

  it('rejects an empty update before touching the database', async () => {
    expect((await callRoute(subject.PATCH, { method: 'PATCH', body: {}, params: { id: UUID } })).status).toBe(422);
    expect(db.callsTo('subjects', 'update')).toHaveLength(0);
  });
});

describe('classes', () => {
  const base = { academicYearId: UUID, name: '10', section: 'A' };
  const patchClass = (body: unknown) => callRoute(schoolClass.PATCH, { method: 'PATCH', body, params: { id: UUID } });

  it('does not allow moving a class to another academic year', async () => {
    expect((await patchClass({ academicYearId: UUID })).status).toBe(422);
  });

  it('accepts only classes 1-12 and sections A-Z', async () => {
    db.respondTo('classes.insert', { data: { id: UUID } });
    for (const name of ['1', '9', '12']) expect((await callRoute(classes.POST, { body: { ...base, name } })).status, name).toBe(201);
    for (const section of ['A', 'Z']) expect((await callRoute(classes.POST, { body: { ...base, section } })).status, section).toBe(201);
    expect(db.callsTo('classes', 'insert')).toHaveLength(5);

    for (const name of ['0', '13', '01', ' 10', 'Nursery', '']) {
      expect((await callRoute(classes.POST, { body: { ...base, name } })).status, name).toBe(422);
    }
    for (const section of ['a', 'AA', '1', ' A', '']) {
      expect((await callRoute(classes.POST, { body: { ...base, section } })).status, section).toBe(422);
    }
    expect((await patchClass({ name: '13' })).status).toBe(422);
    expect((await patchClass({ section: 'b' })).status).toBe(422);
    expect(db.callsTo('classes', 'insert')).toHaveLength(5);
    expect(db.callsTo('classes', 'update')).toHaveLength(0);
  });

  it('requires an existing class teacher', async () => {
    db.respondTo('teachers.select', { data: null });
    const result = await callRoute(classes.POST, { body: { ...base, classTeacherId: UUID } });
    expect([result.status, result.body.error?.details]).toEqual([422, [{ path: 'classTeacherId', message: 'Teacher not found.' }]]);
    expect(db.callsTo('classes', 'insert')).toHaveLength(0);
  });

  it('rejects a deactivated class teacher', async () => {
    db.respondTo('teachers.select', { data: { id: UUID, user: { isActive: false } } });
    expect((await patchClass({ classTeacherId: UUID })).status).toBe(422);
    expect(db.callsTo('classes', 'update')).toHaveLength(0);
  });

  it('accepts an active class teacher, or clearing it', async () => {
    db.respondTo('teachers.select', { data: { id: UUID, user: { isActive: true } } });
    db.respondTo('classes.insert', { data: { id: UUID } });
    db.respondTo('classes.update', { data: { id: UUID } });
    expect((await callRoute(classes.POST, { body: { ...base, classTeacherId: UUID } })).status).toBe(201);
    expect(db.callsTo('classes', 'insert')).toHaveLength(1);

    expect((await patchClass({ classTeacherId: null })).status).toBe(200);
    expect(db.callsTo('teachers')).toHaveLength(1); // CLEARING NEEDS NO TEACHER LOOKUP
    expect(db.callsTo('classes', 'update')[0].payload).toEqual({ classTeacherId: null });
  });
});

describe('list ordering ends with a unique column (stable pagination)', () => {
  it.each([
    ['academic years', academicYears.GET, 'academicYears', 'id'],
    ['subjects', subjects.GET, 'subjects', 'code'],
    ['classes', classes.GET, 'classes', 'id'],
  ])('%s', async (_name, handler, table, uniqueColumn) => {
    await callRoute(handler);
    expect(db.callsTo(table as string, 'select')[0].orders.at(-1)).toBe(uniqueColumn);
  });
});
