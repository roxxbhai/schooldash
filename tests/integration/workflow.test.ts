import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieStore } from './helpers/http';

/**
 * CROSS-MODULE WORKFLOW (final backend audit) — real Supabase.
 *
 * Builds a complete school year through the API only — year, subject,
 * teacher, class, student, enrollment, assignment, attendance, exam, paper,
 * marks, report card, timetable, notice — then deactivates and reactivates
 * the student and checks that access follows and history survives.
 * Also: concurrent duplicate writes, client retries, and identity injection.
 *
 * Every write is made by the persistent integration admin (audit actor). The
 * teacher and student created here only read, so they are deleted on cleanup.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown as CookieStore }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import * as me from '@/app/api/auth/me/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as years from '@/app/api/academic-years/route';
import * as subjects from '@/app/api/subjects/route';
import * as teachers from '@/app/api/teachers/route';
import * as classes from '@/app/api/classes/route';
import * as students from '@/app/api/students/route';
import * as studentOne from '@/app/api/students/[id]/route';
import * as enrollments from '@/app/api/enrollments/route';
import * as assignments from '@/app/api/teacher-assignments/route';
import * as attendance from '@/app/api/student-attendance/route';
import * as exams from '@/app/api/exams/route';
import * as papers from '@/app/api/exam-subjects/route';
import * as results from '@/app/api/results/route';
import * as reportCard from '@/app/api/students/[id]/report-cards/[examId]/route';
import * as timetable from '@/app/api/timetable-entries/route';
import * as notices from '@/app/api/notices/route';
import * as noticeOne from '@/app/api/notices/[id]/route';
import * as publish from '@/app/api/notices/[id]/publish/route';
import * as deactivate from '@/app/api/users/[id]/deactivate/route';
import * as reactivate from '@/app/api/users/[id]/reactivate/route';
import { ensureItAdmin, provisionTestAccount, runId, teardown, testCode, testEmail, testPassword, track, type TestAccount } from './helpers/actors';
import { connect } from './helpers/db';
import { anonymous, call, signIn } from './helpers/http';

const harness = { state };
/** Subject codes are limited to 20 characters. */
const subjectCode = (suffix: string) => `W${runId}${suffix}`.toUpperCase();
let db: pg.Client;
let itAdmin: TestAccount;
let admin: CookieStore;

type Body = Record<string, unknown>;
const post = (as: CookieStore, handler: unknown, path: string, body?: Body, params?: Record<string, string>) =>
  call(harness, as, handler, 'POST', path, { body, params });
const get = (as: CookieStore, handler: unknown, path: string, params?: Record<string, string>) =>
  call(harness, as, handler, 'GET', path, { params });

/** POST as admin, expect 201, return data. */
async function create(handler: unknown, path: string, body: Body) {
  const result = await post(admin, handler, path, body);
  expect(result.status, `${path} ${JSON.stringify(result.body.error)}`).toBe(201);
  return result.body.data;
}

/** Tracks an account created through the API so cleanup removes it. */
async function trackUser(userId: string) {
  const { rows } = await db.query('select "authUserId" from public.users where id = $1', [userId]);
  track('authUsers', rows[0].authUserId);
}

const w = {} as {
  yearId: string; subjectId: string; classId: string; otherClassId: string; examId: string; paperId: string;
  teacher: { id: string; userId: string; email: string; password: string; session?: CookieStore };
  student: { id: string; userId: string; email: string; password: string; session?: CookieStore };
  attendanceId: string; resultId: string; entryId: string; noticeId: string;
};

beforeAll(async () => {
  db = await connect();
  itAdmin = await ensureItAdmin();
  admin = await signIn(harness, itAdmin.email, itAdmin.password);
});

afterAll(async () => {
  await teardown(itAdmin);
  await db?.end();
});

describe('a school year built end to end through the API', () => {
  it('1. year, subject, teacher, class, student, enrollment and assignment', async () => {
    w.yearId = (await create(years.POST, '/api/academic-years', { name: `IT ${runId} wf`, startDate: '2025-04-01', endDate: '2026-03-31' })).id;
    track('academicYears', w.yearId);
    w.subjectId = (await create(subjects.POST, '/api/subjects', { code: subjectCode('S'), name: 'Workflow' })).id;
    track('subjects', w.subjectId);

    const teacherLogin = { email: testEmail('wf-teacher'), password: testPassword() };
    const teacher = await create(teachers.POST, '/api/teachers', { ...teacherLogin, fullName: 'IT wf teacher', employeeCode: testCode('wf-t') });
    await trackUser(teacher.userId);
    w.teacher = { id: teacher.id, userId: teacher.userId, ...teacherLogin };

    w.classId = (await create(classes.POST, '/api/classes', { academicYearId: w.yearId, name: 'WF', section: 'A', classTeacherId: w.teacher.id })).id;
    w.otherClassId = (await create(classes.POST, '/api/classes', { academicYearId: w.yearId, name: 'WF', section: 'B' })).id;
    track('classes', w.classId);
    track('classes', w.otherClassId);

    const studentLogin = { email: testEmail('wf-student'), password: testPassword() };
    const student = await create(students.POST, '/api/students', { ...studentLogin, fullName: 'IT wf student', admissionNumber: testCode('wf-s') });
    await trackUser(student.userId);
    w.student = { id: student.id, userId: student.userId, ...studentLogin };

    const enrollment = await create(enrollments.POST, '/api/enrollments', { studentId: w.student.id, classId: w.classId, rollNumber: 1 });
    track('studentEnrollments', enrollment.id);
    expect(enrollment.academicYearId).toBe(w.yearId);
    track('teacherAssignments', (await create(assignments.POST, '/api/teacher-assignments', { teacherId: w.teacher.id, classId: w.classId, subjectId: w.subjectId })).id);

    w.teacher.session = await signIn(harness, w.teacher.email, w.teacher.password);
    w.student.session = await signIn(harness, w.student.email, w.student.password);
    expect((await get(w.student.session, me.GET, '/api/auth/me')).body.data).toMatchObject({ id: w.student.userId, role: 'STUDENT' });
  });

  it('invalid relationships are rejected: wrong class, duplicate enrollment', async () => {
    const wrongClass = await post(admin, attendance.POST, '/api/student-attendance', { studentId: w.student.id, classId: w.otherClassId, attendanceDate: '2025-06-02', status: 'present' });
    expect([wrongClass.status, wrongClass.body.error?.details?.[0].path]).toEqual([422, 'studentId']);
    const secondClass = await post(admin, enrollments.POST, '/api/enrollments', { studentId: w.student.id, classId: w.otherClassId });
    expect(secondClass.status).toBe(409); // one class per student per year
  });

  it('2. attendance for the enrollment; the student sees their own record', async () => {
    const record = await create(attendance.POST, '/api/student-attendance', { studentId: w.student.id, classId: w.classId, attendanceDate: '2025-06-02', status: 'present' });
    w.attendanceId = record.id;
    track('studentAttendance', record.id);
    const mine = await get(w.student.session!, attendance.GET, '/api/student-attendance');
    expect(mine.body.data.items.map((r: { id: string }) => r.id)).toEqual([record.id]);
  });

  it('3–4. exam, paper and marks; the report card is complete with exact totals', async () => {
    w.examId = (await create(exams.POST, '/api/exams', { academicYearId: w.yearId, name: 'Final', startDate: '2026-03-01', endDate: '2026-03-20' })).id;
    track('exams', w.examId);
    w.paperId = (await create(papers.POST, '/api/exam-subjects', { examId: w.examId, classId: w.classId, subjectId: w.subjectId, maxMarks: 80, passMarks: 28 })).id;
    track('examSubjects', w.paperId);
    const result = await create(results.POST, '/api/results', { examSubjectId: w.paperId, studentId: w.student.id, marksObtained: 61.5 });
    w.resultId = result.id;
    track('results', result.id);
    expect(result.enteredByUserId).toBe(itAdmin.userId);

    const card = await get(w.student.session!, reportCard.GET, `/api/students/${w.student.id}/report-cards/${w.examId}`, { id: w.student.id, examId: w.examId });
    expect(card.status).toBe(200);
    expect(card.body.data.summary).toEqual({ subjectsConfigured: 1, subjectsWithMarks: 1, complete: true, totalMarksObtained: 61.5, totalMaxMarks: 80 });
    expect(card.body.data).not.toHaveProperty('percentage');
  });

  it('5. a timetable entry; the student and the teacher both see it', async () => {
    w.entryId = (await create(timetable.POST, '/api/timetable-entries', { classId: w.classId, subjectId: w.subjectId, teacherId: w.teacher.id, dayOfWeek: 2, startTime: '10:00', endTime: '10:40' })).id;
    track('timetableEntries', w.entryId);
    for (const session of [w.student.session!, w.teacher.session!]) {
      const visible = await get(session, timetable.GET, `/api/timetable-entries?classId=${w.classId}`);
      expect(visible.body.data.items.map((r: { id: string }) => r.id)).toEqual([w.entryId]);
    }
  });

  it('6. a class notice, once published, reaches its audience only', async () => {
    w.noticeId = (await create(notices.POST, '/api/notices', { title: `IT ${runId} wf notice`, body: 'Exam timetable', audiences: [{ classId: w.classId }] })).id;
    track('notices', w.noticeId);
    expect((await get(w.student.session!, noticeOne.GET, `/api/notices/${w.noticeId}`, { id: w.noticeId })).status).toBe(404);
    expect((await post(admin, publish.POST, `/api/notices/${w.noticeId}/publish`, undefined, { id: w.noticeId })).status).toBe(200);
    expect((await get(w.student.session!, noticeOne.GET, `/api/notices/${w.noticeId}`, { id: w.noticeId })).status).toBe(200);
    expect((await get(w.teacher.session!, noticeOne.GET, `/api/notices/${w.noticeId}`, { id: w.noticeId })).status).toBe(200); // class teacher
  });

  it('7. deactivating the student ends access but keeps every academic record', async () => {
    const result = await post(admin, deactivate.POST, `/api/users/${w.student.userId}/deactivate`, undefined, { id: w.student.userId });
    expect(result.status).toBe(200);
    expect((await get(w.student.session!, me.GET, '/api/auth/me')).status).toBe(401);
    const login = await call(harness, anonymous(), loginRoute.POST, 'POST', '/api/auth/login', { body: { email: w.student.email, password: w.student.password } });
    expect([login.status, login.body.error?.code]).toEqual([403, 'ACCOUNT_INACTIVE']);

    const history = await db.query(
      `select (select count(*)::int from public."studentEnrollments" where "studentId" = $1) enrollments,
              (select count(*)::int from public."studentAttendance" where id = $2) attendance,
              (select count(*)::int from public.results where id = $3) results`,
      [w.student.id, w.attendanceId, w.resultId],
    );
    expect(history.rows[0]).toEqual({ enrollments: 1, attendance: 1, results: 1 });
    const card = await get(admin, reportCard.GET, `/api/students/${w.student.id}/report-cards/${w.examId}`, { id: w.student.id, examId: w.examId });
    expect(card.body.data.summary.totalMarksObtained).toBe(61.5);
    // No new academic records for a deactivated student.
    const more = await post(admin, attendance.POST, '/api/student-attendance', { studentId: w.student.id, classId: w.classId, attendanceDate: '2025-06-03', status: 'present' });
    expect(more.status).toBe(422);
  });

  it('8. reactivation restores access; the student signs in again and sees their history', async () => {
    expect((await post(admin, reactivate.POST, `/api/users/${w.student.userId}/reactivate`, undefined, { id: w.student.userId })).status).toBe(200);
    w.student.session = await signIn(harness, w.student.email, w.student.password);
    const card = await get(w.student.session, reportCard.GET, `/api/students/${w.student.id}/report-cards/${w.examId}`, { id: w.student.id, examId: w.examId });
    expect([card.status, card.body.data.summary.complete]).toEqual([200, true]);
  });

  it('the actions above are in the audit log with the acting admin', async () => {
    const { rows } = await db.query(
      'select distinct action from public."auditLogs" where "actorUserId" = $1 and "entityId" = any($2)',
      [itAdmin.userId, [w.yearId, w.classId, w.attendanceId, w.resultId, w.entryId, w.noticeId, w.examId, w.paperId, w.student.userId]],
    );
    expect(rows.map((r) => r.action).sort()).toEqual(
      expect.arrayContaining([
        'academicYears.insert', 'classes.insert', 'examSubjects.insert', 'exams.insert', 'notices.insert', 'notices.update',
        'results.insert', 'timetableEntries.insert', 'users.deactivate', 'users.reactivate',
      ]),
    );
  });
});

describe('concurrent duplicates and client retries', () => {
  it('two simultaneous attendance submissions for the same student and day: one 201, one 409, one row', async () => {
    const body = { studentId: w.student.id, classId: w.classId, attendanceDate: '2025-06-10', status: 'present' };
    const both = await Promise.all([post(admin, attendance.POST, '/api/student-attendance', body), post(admin, attendance.POST, '/api/student-attendance', body)]);
    both.forEach((r) => r.status === 201 && track('studentAttendance', r.body.data.id));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    const rows = await db.query('select count(*)::int n from public."studentAttendance" where "studentId" = $1 and "attendanceDate" = \'2025-06-10\'', [w.student.id]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('two simultaneous mark entries for the same student and paper: one 201, one 409', async () => {
    const exam2 = await create(exams.POST, '/api/exams', { academicYearId: w.yearId, name: 'Retest' });
    track('exams', exam2.id);
    const paper2 = await create(papers.POST, '/api/exam-subjects', { examId: exam2.id, classId: w.classId, subjectId: w.subjectId, maxMarks: 50 });
    track('examSubjects', paper2.id);
    const body = { examSubjectId: paper2.id, studentId: w.student.id, marksObtained: 40 };
    const both = await Promise.all([post(admin, results.POST, '/api/results', body), post(admin, results.POST, '/api/results', { ...body, marksObtained: 41 })]);
    both.forEach((r) => r.status === 201 && track('results', r.body.data.id));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    const rows = await db.query('select count(*)::int n from public.results where "examSubjectId" = $1', [paper2.id]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('a retried create (same request twice) never makes a duplicate', async () => {
    const body = { code: subjectCode('R'), name: 'Retry' };
    const first = await post(admin, subjects.POST, '/api/subjects', body);
    track('subjects', first.body.data?.id);
    const retry = await post(admin, subjects.POST, '/api/subjects', body);
    expect([first.status, retry.status]).toEqual([201, 409]);
  });
});

describe('identity cannot be injected by the client', () => {
  it('query strings and headers do not change who the caller is', async () => {
    const result = await call(harness, w.student.session!, me.GET, 'GET', `/api/auth/me?role=ADMIN&userId=${itAdmin.userId}`, {
      headers: { 'x-user-id': itAdmin.userId, 'x-user-role': 'ADMIN', 'x-role': 'admin' },
    });
    expect(result.body.data).toMatchObject({ id: w.student.userId, role: 'STUDENT' });
    const admins = await call(harness, w.student.session!, teachers.GET, 'GET', '/api/teachers?role=ADMIN', { headers: { 'x-user-role': 'ADMIN' } });
    expect(admins.status).toBe(403);
  });

  it('a bearer token in a header is not a session: only the server-managed cookie counts', async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email: itAdmin.email, password: itAdmin.password });
    const token = signedIn.data.session!.access_token;
    const result = await call(harness, anonymous(), me.GET, 'GET', '/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    expect(result.status).toBe(401);
    await client.auth.signOut({ scope: 'local' }); // the default (global) would also end the admin cookie session
  });

  it('body fields naming another user or role are rejected, not trusted', async () => {
    const asOther = await post(admin, attendance.POST, '/api/student-attendance', { studentId: w.student.id, classId: w.classId, attendanceDate: '2025-06-11', status: 'present', markedByUserId: w.teacher.userId });
    expect(asOther.status).toBe(422);
    const roleInBody = await post(admin, students.POST, '/api/students', { email: testEmail('wf-x'), fullName: 'x', admissionNumber: testCode('wf-x'), role: 'ADMIN' });
    expect(roleInBody.status).toBe(422);
  });

  it('path ids are resources, not identities: a student naming another student is refused', async () => {
    const other = await provisionTestAccount('wf-other', { role: 'STUDENT', profile: { admissionNumber: testCode('wf-o') } });
    const otherId = (await db.query('select id from public.students where "userId" = $1', [other.userId])).rows[0].id;
    expect((await get(w.student.session!, studentOne.GET, `/api/students/${otherId}`, { id: otherId })).status).toBe(403);
    expect((await get(w.student.session!, reportCard.GET, `/api/students/${otherId}/report-cards/${w.examId}`, { id: otherId, examId: w.examId })).status).toBe(403);
  });
});
