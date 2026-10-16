import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF THE NOTICE ROUTES: REAL HANDLERS, A RECORDING FAKE DATABASE
// CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
}));

import * as notices from '@/app/api/notices/route';
import * as notice from '@/app/api/notices/[id]/route';
import * as noticeArchive from '@/app/api/notices/[id]/archive/route';
import * as noticeAudiences from '@/app/api/notices/[id]/audiences/route';
import { NOTICE_ERRORS } from '@/constants/notices';
import { mapDbError } from '@/helpers/db-error';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOTICE_ID = ID(1);
const CLASS_A = ID(2);
const admin = makeUser('ADMIN', ID(10));
const student = makeUser('STUDENT', ID(11));
const ROW = { id: NOTICE_ID, title: 'T', body: 'B', category: null, status: 'draft', publishedAt: null, createdByUserId: admin.id };
const WITH_AUDIENCES = { ...ROW, audiences: [{ id: ID(21), audienceRole: null, classId: CLASS_A }, { id: ID(20), audienceRole: 'student', classId: null }] };
const OUTAGE = { error: { message: 'fetch failed' } }; // NO CODE: SUPABASE UNREACHABLE
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  actAs(admin);
});

const valid = { title: 'Sports day', body: 'Friday', audiences: [{ role: 'STUDENT' }, { classId: CLASS_A }] };
const createNotice = (body: object) => callRoute(notices.POST, { body });
const editNotice = (body: object) => callRoute(notice.PATCH, { method: 'PATCH', params: { id: NOTICE_ID }, body });
const setAudiences = (body: object) => callRoute(noticeAudiences.PUT, { method: 'PUT', params: { id: NOTICE_ID }, body });

/** CLASS A EXISTS; THE NOTICE READS BACK WITH ITS AUDIENCES. */
function seedNotice() {
  db.respondTo('classes.select', { data: [{ id: CLASS_A }] });
  db.respondTo('createNotice.rpc', { data: NOTICE_ID });
  db.respondTo('notices.select', { data: WITH_AUDIENCES });
}

describe('input validation', () => {
  it('accepts role and class audiences; audiences default to none', async () => {
    seedNotice();
    expect((await createNotice(valid)).status).toBe(201);
    expect((await createNotice({ title: 'x', body: 'y' })).status).toBe(201);
    expect(db.callsTo('createNotice', 'rpc')[1].payload).toMatchObject({ audiences: [] });
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a missing body', { body: undefined }],
    ['a client-supplied status', { status: 'published' }],
    ['a client-supplied publishedAt', { publishedAt: '2026-01-01T00:00:00Z' }],
    ['a client-supplied createdByUserId', { createdByUserId: ID(9) }],
    ['an unknown role', { audiences: [{ role: 'PARENT' }] }],
    ['an audience with both role and class', { audiences: [{ role: 'STUDENT', classId: CLASS_A }] }],
    ['an empty audience object', { audiences: [{}] }],
    ['a malformed classId', { audiences: [{ classId: 'x' }] }],
    ['a duplicate role', { audiences: [{ role: 'TEACHER' }, { role: 'TEACHER' }] }],
    ['a duplicate class', { audiences: [{ classId: CLASS_A }, { classId: CLASS_A }] }],
  ])('rejects %s', async (_label, override) => {
    expect((await createNotice({ ...valid, ...override })).status).toBe(422);
    expect(db.callsTo('createNotice')).toHaveLength(0);
  });

  it('edits cannot change status or audiences through PATCH', async () => {
    expect((await editNotice({ status: 'published' })).status).toBe(422);
    expect((await editNotice({ audiences: [] })).status).toBe(422);
  });

  it('an empty audience set is allowed for a draft', async () => {
    seedNotice();
    expect((await setAudiences({ audiences: [] })).status).toBe(200);
  });

  it('status filter uses the database values', async () => {
    expect((await callRoute(notices.GET, { path: '/api/notices?status=archived' })).status).toBe(200);
    expect((await callRoute(notices.GET, { path: '/api/notices?status=ARCHIVED' })).status).toBe(400);
  });
});

describe('creating and targeting', () => {
  it('sends one atomic create with database role values, then returns the admin view', async () => {
    seedNotice();
    const result = await createNotice({ title: 'T', body: 'B', audiences: [{ role: 'STUDENT' }, { classId: CLASS_A }] });
    expect(db.callsTo('createNotice', 'rpc')[0].payload).toEqual({
      title: 'T', body: 'B', category: null, audiences: [{ audienceRole: 'student' }, { classId: CLASS_A }],
    });
    expect(result.body.data).toMatchObject({ id: NOTICE_ID, audiences: [{ role: null, classId: CLASS_A }, { role: 'STUDENT', classId: null }] });
  });

  it('rejects an unknown class (422 on the exact audience) and writes nothing', async () => {
    db.respondTo('classes.select', { data: [] });
    const result = await createNotice({ title: 'T', body: 'B', audiences: [{ role: 'TEACHER' }, { classId: CLASS_A }] });
    expect([result.status, result.body.error?.details?.[0].path]).toEqual([422, 'audiences.1.classId']);
    expect(db.callsTo('createNotice')).toHaveLength(0);
  });

  it('replaces audiences through the atomic database function', async () => {
    seedNotice();
    await setAudiences({ audiences: [{ role: 'TEACHER' }] });
    expect(db.callsTo('setNoticeAudiences', 'rpc')[0].payload).toEqual({ noticeId: NOTICE_ID, audiences: [{ audienceRole: 'teacher' }] });
  });
});

describe('state rules', () => {
  it('edits apply only to drafts; a non-draft is a 409, a missing notice a 404', async () => {
    db.respondTo('notices.update', { data: null });
    db.respondTo('notices.select', { data: ROW }, { data: null });
    const nonDraft = await editNotice({ title: 'x' });
    expect([nonDraft.status, nonDraft.body.error?.message]).toEqual([409, 'Only draft notices can be edited.']);
    const update = db.callsTo('notices', 'update')[0];
    expect([update.payload, update.filters]).toEqual([{ title: 'x' }, [['eq', 'id', NOTICE_ID], ['in', 'status', ['draft']]]]);
    expect((await editNotice({ title: 'x' })).status).toBe(404);
  });

  it('REGRESSION: an outage while explaining a failed change is a 503, not a misleading 404', async () => {
    db.respondTo('notices.update', { data: null });
    db.respondTo('notices.select', OUTAGE);
    expect((await editNotice({ title: 'x' })).status).toBe(503);
  });

  it('archiving is allowed from draft or published; archiving twice is a 409', async () => {
    const archive = () => callRoute(noticeArchive.POST, { method: 'POST', params: { id: NOTICE_ID } });
    db.respondTo('notices.update', { data: ROW }, { data: null });
    db.respondTo('notices.select', { data: WITH_AUDIENCES });
    expect((await archive()).status).toBe(200);
    const update = db.callsTo('notices', 'update')[0];
    expect([update.payload, update.filters]).toEqual([{ status: 'archived' }, [['eq', 'id', NOTICE_ID], ['in', 'status', ['draft', 'published']]]]);
    expect((await archive()).status).toBe(409);
  });

  it.each([
    ['noticesStatusTransition', 'The notice is not in a state that allows this change.'],
    ['noticesPublishRequiresAudience', 'Add at least one audience before publishing.'],
    ['noticeAudiencesNoticeNotDraft', 'Audiences can change only while the notice is a draft.'],
    ['noticesContentLocked', 'Only draft notices can be edited.'],
  ])('database state rule %s maps to a 409 with a safe message', (constraint, message) => {
    const error = mapDbError({ code: '55000', message: `x (constraint "${constraint}")` }, 'x', NOTICE_ERRORS);
    expect(error).toMatchObject({ status: 409, message });
  });
});

describe('reading', () => {
  it('admins get audiences; other roles never do', async () => {
    const read = () => callRoute(notice.GET, { params: { id: NOTICE_ID } });
    db.respondTo('notices.select', { data: WITH_AUDIENCES }, { data: ROW });
    expect((await read()).body.data).toHaveProperty('audiences');
    expect(db.callsTo('notices', 'select')[0].columns).toContain('audiences');
    actAs(student);
    expect((await read()).body.data).not.toHaveProperty('audiences');
    expect(db.callsTo('notices', 'select')[1].columns).not.toContain('audiences');
    await callRoute(notices.GET);
    expect(db.callsTo('notices', 'select')[2].columns).not.toContain('audiences');
  });

  it('the list ends its ordering with a unique column (stable pagination)', async () => {
    await callRoute(notices.GET);
    expect(db.callsTo('notices', 'select')[0].orders.at(-1)).toBe('id');
  });
});
