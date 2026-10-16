import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE TIMETABLE ROUTES: REAL HANDLERS AND ASSIGNMENT CHECKS, A
// RECORDING FAKE DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
}));

import * as timetable from '@/app/api/timetable-entries/route';
import * as timetableEntry from '@/app/api/timetable-entries/[id]/route';
import { TIMETABLE_ERRORS } from '@/constants/timetable';
import { mapDbError } from '@/helpers/db-error';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLASS = ID(1);
const SUBJECT = ID(2);
const TEACHER = ID(3);
const valid = { classId: CLASS, subjectId: SUBJECT, teacherId: TEACHER, dayOfWeek: 1, startTime: '09:00', endTime: '09:45' };
const CURRENT = { id: ID(9), classId: CLASS, subjectId: SUBJECT, teacherId: TEACHER, dayOfWeek: 1, startTime: '09:00:00', endTime: '09:45:00', room: null };
const OVERLAP = { error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "timetableEntriesClassNoOverlap"' } };
let db: ReturnType<typeof fakeDb>;

/** AN EXISTING CLASS AND SUBJECT, AND AN ACTIVE TEACHER WHO IS (OR ISN'T) ASSIGNED TO THEM. */
function seedSchool({ isAssigned = true, insertResponse = { data: { id: ID(60) } } as object } = {}) {
  db.respondTo('classes.select', { data: { id: CLASS } });
  db.respondTo('subjects.select', { data: { id: SUBJECT } });
  db.respondTo('teachers.select', { data: { id: TEACHER, user: { isActive: true } } });
  db.respondTo('teacherAssignments.select', { data: isAssigned ? { id: ID(50) } : null });
  db.respondTo('timetableEntries.select', { data: CURRENT });
  db.respondTo('timetableEntries.insert', insertResponse);
  db.respondTo('timetableEntries.update', { data: { id: ID(60) } });
}

/** THE FILTERS OF EVERY ASSIGNMENT CHECK, I.E. WHICH (TEACHER, CLASS, SUBJECT) WAS VERIFIED. */
function assignmentChecks() {
  return db.callsTo('teacherAssignments', 'select').map((call) => call.filters);
}

beforeEach(() => {
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(makeUser('ADMIN', ID(99)));
});

const create = (body: object) => callRoute(timetable.POST, { body });
const update = (body: object) => callRoute(timetableEntry.PATCH, { method: 'PATCH', params: { id: CURRENT.id }, body });

describe('input validation', () => {
  it('normalises HH:MM to HH:MM:SS and accepts HH:MM:SS', async () => {
    seedSchool();
    await create({ ...valid, endTime: '09:45:30' });
    expect(db.callsTo('timetableEntries', 'insert')[0].payload).toMatchObject({ startTime: '09:00:00', endTime: '09:45:30' });
  });

  it.each([
    ['end before start', { startTime: '10:00', endTime: '09:00' }, 'endTime'],
    ['end equal to start', { startTime: '10:00', endTime: '10:00' }, 'endTime'],
    ['a 12-hour time', { startTime: '9:00 AM' }, 'startTime'],
    ['hour 24', { endTime: '24:00' }, 'endTime'],
    ['day 0', { dayOfWeek: 0 }, 'dayOfWeek'],
    ['day 8', { dayOfWeek: 8 }, 'dayOfWeek'],
    ['a missing subject', { subjectId: undefined }, 'subjectId'],
    ['a client-supplied academicYearId', { academicYearId: ID(7) }, ''],
  ])('rejects %s', async (_label, override, path) => {
    const result = await create({ ...valid, ...override });
    expect(result.status).toBe(422);
    expect(result.body.error?.details?.map((issue) => issue.path)).toContain(path);
  });

  it('allows an unstaffed period (no teacher)', async () => {
    seedSchool();
    expect((await create({ ...valid, teacherId: null })).status).toBe(201);
    expect((await create({ ...valid, teacherId: undefined })).status).toBe(201);
  });

  it('parses the day filter from the query string', async () => {
    await callRoute(timetable.GET, { path: '/api/timetable-entries?dayOfWeek=3' });
    expect(db.callsTo('timetableEntries', 'select')[0].filters).toContainEqual(['eq', 'dayOfWeek', 3]);
    expect((await callRoute(timetable.GET, { path: '/api/timetable-entries?dayOfWeek=9' })).status).toBe(400);
  });
});

describe('creating', () => {
  it('checks class, subject, active teacher and exact assignment, then inserts', async () => {
    seedSchool();
    expect((await create(valid)).status).toBe(201);
    expect(db.callsTo('teachers', 'select')).toHaveLength(1);
    expect(assignmentChecks()).toEqual([[['eq', 'teacherId', TEACHER], ['eq', 'classId', CLASS], ['eq', 'subjectId', SUBJECT]]]);
    expect(db.callsTo('timetableEntries', 'insert')[0].payload).toMatchObject({ startTime: '09:00:00', endTime: '09:45:00', teacherId: TEACHER });
  });

  it('an unstaffed period skips the teacher checks', async () => {
    seedSchool();
    await create({ ...valid, teacherId: null });
    expect(db.callsTo('teachers')).toHaveLength(0);
    expect(db.callsTo('timetableEntries', 'insert')[0].payload).toMatchObject({ teacherId: null });
  });

  it('rejects a teacher who is not assigned to that class AND subject (422 on teacherId)', async () => {
    seedSchool({ isAssigned: false });
    const result = await create(valid);
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'teacherId']);
    expect(db.callsTo('timetableEntries', 'insert')).toHaveLength(0);
  });

  it.each([
    ['class', 'classes', 'classId'],
    ['subject', 'subjects', 'subjectId'],
  ])('reports a missing %s as 422', async (_label, table, path) => {
    db.respondTo(`${table}.select`, { data: null }); // QUEUED FIRST, SO IT ANSWERS THE LOOKUP
    seedSchool();
    const result = await create(valid);
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, path]);
  });
});

describe('updating validates the resulting complete entry', () => {
  it('rejects a new endTime that falls before the stored startTime', async () => {
    seedSchool();
    const result = await update({ endTime: '08:30' });
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'endTime']);
    expect(db.callsTo('timetableEntries', 'update')).toHaveLength(0);
  });

  it("re-checks the teacher's assignment when only the subject changes", async () => {
    seedSchool({ isAssigned: false });
    const result = await update({ subjectId: ID(5) });
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'teacherId']);
    expect(assignmentChecks()).toEqual([[['eq', 'teacherId', TEACHER], ['eq', 'classId', CLASS], ['eq', 'subjectId', ID(5)]]]);
  });

  it('does not re-check staffing for a time-only change, and sends only the changed fields', async () => {
    seedSchool();
    await update({ startTime: '09:10', endTime: '10:00' });
    expect(assignmentChecks()).toHaveLength(0);
    expect(db.callsTo('timetableEntries', 'update')[0].payload).toEqual({ startTime: '09:10:00', endTime: '10:00:00' });
  });

  it('can unstaff a period', async () => {
    seedSchool();
    await update({ teacherId: null });
    expect(db.callsTo('teachers')).toHaveLength(0);
    expect(db.callsTo('timetableEntries', 'update')[0].payload).toEqual({ teacherId: null });
  });

  it('rejects an empty update', async () => {
    expect((await update({})).status).toBe(422);
  });
});

describe('database conflicts map to safe 409s', () => {
  it.each([
    ['timetableEntriesClassNoOverlap', '23P01', 'The class already has a period that overlaps this time.'],
    ['timetableEntriesTeacherNoOverlap', '23P01', 'The teacher already has a period that overlaps this time.'],
    ['timetableEntriesClassSlotKey', '23505', 'The class already has a period that overlaps this time.'],
  ])('%s', (constraint, code, message) => {
    const error = mapDbError({ code, message: `conflicting key value violates exclusion constraint "${constraint}"` }, 'x', TIMETABLE_ERRORS);
    expect(error).toMatchObject({ status: 409, message });
  });

  it('a teacher without the matching assignment (composite FK) is a 422 on teacherId', () => {
    const error = mapDbError(
      { code: '23503', message: 'insert or update on table "timetableEntries" violates foreign key constraint "timetableEntriesAssignmentFkey"' },
      'x',
      TIMETABLE_ERRORS,
    );
    expect(error).toMatchObject({ status: 422, details: [{ path: 'teacherId' }] });
  });

  it('a conflict reaches the client as a 409 with the safe message only', async () => {
    seedSchool({ insertResponse: OVERLAP });
    expect(await create({ ...valid, teacherId: null })).toEqual({
      status: 409,
      body: { data: null, error: { code: 'CONFLICT', message: 'The class already has a period that overlaps this time.' } },
    });
  });
});

describe('list ordering ends with a unique column (stable pagination)', () => {
  it('timetable entries', async () => {
    await callRoute(timetable.GET);
    expect(db.callsTo('timetableEntries', 'select')[0].orders.at(-1)).toBe('id');
  });
});
