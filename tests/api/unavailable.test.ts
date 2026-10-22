import { fakeCookieStore } from '../helpers/fake-cookies';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Database/Auth UNAVAILABLE: every endpoint must return 503
 * SERVICE_UNAVAILABLE — never a 2xx and never fabricated data.
 *
 * Supabase is pointed at a closed local port, so the real supabase-js code
 * hits a genuine connection failure (no mocked fetch).
 *   - "auth layer": a session cookie makes getUser() call the dead Auth server.
 *   - "data layer": the guards are stubbed to an admin (unit test only) so the
 *     repository's own query is the call that fails.
 */

const state = vi.hoisted(() => ({ cookies: undefined as unknown, stubGuards: false }));
vi.mock('next/headers', () => ({ cookies: async () => state.cookies }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/functions/authorization', async (original) => {
  const real = await original<typeof import('@/functions/authorization')>();
  const admin = { id: '00000000-0000-4000-8000-0000000000a1', authUserId: 'x', role: 'ADMIN', isActive: true, fullName: 'Admin', email: 'admin@example.com' };
  const stub = <T extends (...args: never[]) => unknown>(fn: T) =>
    ((...args: Parameters<T>) => (state.stubGuards ? Promise.resolve({ success: true, message: '', data: admin }) : fn(...args))) as T;
  return {
    ...real,
    requireAuthenticatedUser: stub(real.requireAuthenticatedUser),
    requireAdmin: stub(real.requireAdmin),
    requireRole: stub(real.requireRole),
  };
});

import * as me from '@/app/api/auth/me/route';
import * as years from '@/app/api/academic-years/route';
import * as year from '@/app/api/academic-years/[id]/route';
import * as setCurrent from '@/app/api/academic-years/[id]/set-current/route';
import * as subjects from '@/app/api/subjects/route';
import * as subject from '@/app/api/subjects/[id]/route';
import * as classes from '@/app/api/classes/route';
import * as klass from '@/app/api/classes/[id]/route';
import * as teachers from '@/app/api/teachers/route';
import * as teacher from '@/app/api/teachers/[id]/route';
import * as students from '@/app/api/students/route';
import * as student from '@/app/api/students/[id]/route';
import * as enrollments from '@/app/api/enrollments/route';
import * as enrollment from '@/app/api/enrollments/[id]/route';
import * as assignments from '@/app/api/teacher-assignments/route';
import * as assignment from '@/app/api/teacher-assignments/[id]/route';
import * as deactivate from '@/app/api/users/[id]/deactivate/route';
import * as reactivate from '@/app/api/users/[id]/reactivate/route';
import * as studentAttendance from '@/app/api/student-attendance/route';
import * as studentAttendanceBulk from '@/app/api/student-attendance/bulk/route';
import * as studentAttendanceRecord from '@/app/api/student-attendance/[id]/route';
import * as teacherAttendance from '@/app/api/teacher-attendance/route';
import * as teacherAttendanceRecord from '@/app/api/teacher-attendance/[id]/route';
import * as examsRoute from '@/app/api/exams/route';
import * as examRoute from '@/app/api/exams/[id]/route';
import * as papersRoute from '@/app/api/exam-subjects/route';
import * as paperRoute from '@/app/api/exam-subjects/[id]/route';
import * as resultsRoute from '@/app/api/results/route';
import * as resultsBulkRoute from '@/app/api/results/bulk/route';
import * as resultRoute from '@/app/api/results/[id]/route';
import * as reportCardRoute from '@/app/api/students/[id]/report-cards/[examId]/route';
import * as timetableRoute from '@/app/api/timetable-entries/route';
import * as timetableEntryRoute from '@/app/api/timetable-entries/[id]/route';
import * as noticesRoute from '@/app/api/notices/route';
import * as noticeRoute from '@/app/api/notices/[id]/route';
import * as noticeAudiencesRoute from '@/app/api/notices/[id]/audiences/route';
import * as noticePublishRoute from '@/app/api/notices/[id]/publish/route';
import * as noticeArchiveRoute from '@/app/api/notices/[id]/archive/route';

const DEAD = 'http://127.0.0.1:1';
const ID = '3f2b8c1e-9d4a-4f6b-8e2c-1a7d5b9c0e3f';
const APP = 'http://localhost:3000';

function sessionCookie() {
  const session = {
    access_token: 'a.b.c',
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: ID, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  return { 'sb-127-auth-token': `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` };
}

type Case = [string, unknown, string, Record<string, unknown> | undefined];
const cases: Case[] = [
  ['GET /auth/me', me.GET, 'GET', undefined],
  ['GET /academic-years', years.GET, 'GET', undefined],
  ['POST /academic-years', years.POST, 'POST', { name: 'x', startDate: '2090-01-01', endDate: '2090-12-31' }],
  ['GET /academic-years/{id}', year.GET, 'GET', undefined],
  ['PATCH /academic-years/{id}', year.PATCH, 'PATCH', { name: 'x' }],
  ['POST /academic-years/{id}/set-current', setCurrent.POST, 'POST', undefined],
  ['GET /subjects', subjects.GET, 'GET', undefined],
  ['POST /subjects', subjects.POST, 'POST', { name: 'X' }],
  ['GET /subjects/{id}', subject.GET, 'GET', undefined],
  ['PATCH /subjects/{id}', subject.PATCH, 'PATCH', { name: 'x' }],
  ['GET /classes', classes.GET, 'GET', undefined],
  ['POST /classes', classes.POST, 'POST', { academicYearId: ID, name: '1', section: 'A' }],
  ['GET /classes/{id}', klass.GET, 'GET', undefined],
  ['PATCH /classes/{id}', klass.PATCH, 'PATCH', { roomNumber: 'x' }],
  ['GET /teachers', teachers.GET, 'GET', undefined],
  ['POST /teachers', teachers.POST, 'POST', { email: 'x@example.com', fullName: 'X', phone: '9876543210' }],
  ['GET /teachers/{id}', teacher.GET, 'GET', undefined],
  ['PATCH /teachers/{id}', teacher.PATCH, 'PATCH', { qualification: 'x' }],
  ['GET /students', students.GET, 'GET', undefined],
  ['POST /students', students.POST, 'POST', { email: 'x@example.com', fullName: 'X', admissionNumber: 'X' }],
  ['GET /students/{id}', student.GET, 'GET', undefined],
  ['PATCH /students/{id}', student.PATCH, 'PATCH', { address: 'x' }],
  ['GET /enrollments', enrollments.GET, 'GET', undefined],
  ['POST /enrollments', enrollments.POST, 'POST', { studentId: ID, classId: ID }],
  ['GET /enrollments/{id}', enrollment.GET, 'GET', undefined],
  ['PATCH /enrollments/{id}', enrollment.PATCH, 'PATCH', { rollNumber: 2 }],
  ['GET /teacher-assignments', assignments.GET, 'GET', undefined],
  ['POST /teacher-assignments', assignments.POST, 'POST', { teacherId: ID, classId: ID, subjectId: ID }],
  ['GET /teacher-assignments/{id}', assignment.GET, 'GET', undefined],
  ['DELETE /teacher-assignments/{id}', assignment.DELETE, 'DELETE', undefined],
  ['POST /users/{id}/deactivate', deactivate.POST, 'POST', undefined],
  ['POST /users/{id}/reactivate', reactivate.POST, 'POST', undefined],
  ['GET /student-attendance', studentAttendance.GET, 'GET', undefined],
  ['POST /student-attendance', studentAttendance.POST, 'POST', { studentId: ID, classId: ID, attendanceDate: '2015-06-01', status: 'present' }],
  ['POST /student-attendance/bulk', studentAttendanceBulk.POST, 'POST', { classId: ID, attendanceDate: '2015-06-01', records: [{ studentId: ID, status: 'present' }] }],
  ['GET /student-attendance/{id}', studentAttendanceRecord.GET, 'GET', undefined],
  ['PATCH /student-attendance/{id}', studentAttendanceRecord.PATCH, 'PATCH', { status: 'late' }],
  ['GET /teacher-attendance', teacherAttendance.GET, 'GET', undefined],
  ['POST /teacher-attendance', teacherAttendance.POST, 'POST', { teacherId: ID, attendanceDate: '2015-06-01', status: 'present' }],
  ['GET /teacher-attendance/{id}', teacherAttendanceRecord.GET, 'GET', undefined],
  ['PATCH /teacher-attendance/{id}', teacherAttendanceRecord.PATCH, 'PATCH', { status: 'late' }],
  ['GET /exams', examsRoute.GET, 'GET', undefined],
  ['POST /exams', examsRoute.POST, 'POST', { academicYearId: ID, name: 'x' }],
  ['GET /exams/{id}', examRoute.GET, 'GET', undefined],
  ['PATCH /exams/{id}', examRoute.PATCH, 'PATCH', { name: 'x' }],
  ['GET /exam-subjects', papersRoute.GET, 'GET', undefined],
  ['POST /exam-subjects', papersRoute.POST, 'POST', { examId: ID, classId: ID, subjectId: ID, maxMarks: 10 }],
  ['GET /exam-subjects/{id}', paperRoute.GET, 'GET', undefined],
  ['PATCH /exam-subjects/{id}', paperRoute.PATCH, 'PATCH', { examDate: null }],
  ['GET /results', resultsRoute.GET, 'GET', undefined],
  ['POST /results', resultsRoute.POST, 'POST', { examSubjectId: ID, studentId: ID, marksObtained: 1 }],
  ['POST /results/bulk', resultsBulkRoute.POST, 'POST', { examSubjectId: ID, records: [{ studentId: ID, marksObtained: 1 }] }],
  ['GET /results/{id}', resultRoute.GET, 'GET', undefined],
  ['PATCH /results/{id}', resultRoute.PATCH, 'PATCH', { remarks: 'x', expectedUpdatedAt: '2026-01-01T00:00:00Z' }],
  ['GET /students/{id}/report-cards/{examId}', reportCardRoute.GET, 'GET', undefined],
  ['GET /timetable-entries', timetableRoute.GET, 'GET', undefined],
  ['POST /timetable-entries', timetableRoute.POST, 'POST', { classId: ID, subjectId: ID, dayOfWeek: 1, startTime: '09:00', endTime: '09:45' }],
  ['GET /timetable-entries/{id}', timetableEntryRoute.GET, 'GET', undefined],
  ['PATCH /timetable-entries/{id}', timetableEntryRoute.PATCH, 'PATCH', { room: 'x' }],
  ['DELETE /timetable-entries/{id}', timetableEntryRoute.DELETE, 'DELETE', undefined],
  ['GET /notices', noticesRoute.GET, 'GET', undefined],
  ['POST /notices', noticesRoute.POST, 'POST', { title: 'x', body: 'y', audiences: [{ role: 'STUDENT' }] }],
  ['GET /notices/{id}', noticeRoute.GET, 'GET', undefined],
  ['PATCH /notices/{id}', noticeRoute.PATCH, 'PATCH', { title: 'x' }],
  ['PUT /notices/{id}/audiences', noticeAudiencesRoute.PUT, 'PUT', { audiences: [{ classId: ID }] }],
  ['POST /notices/{id}/publish', noticePublishRoute.POST, 'POST', undefined],
  ['POST /notices/{id}/archive', noticeArchiveRoute.POST, 'POST', undefined],
];

async function invoke(handler: unknown, method: string, body?: Record<string, unknown>) {
  state.cookies = fakeCookieStore(sessionCookie());
  const response = await (handler as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`${APP}/api/x`, {
      method,
      headers: { origin: APP, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ id: ID, examId: ID }) },
  );
  return { status: response.status, body: await response.json() };
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', DEAD);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllEnvs();
  consoleError.mockRestore();
});

describe('Supabase unreachable — auth layer', () => {
  it.each(cases)('%s → 503', async (_name, handler, method, body) => {
    state.stubGuards = false;
    const result = await invoke(handler, method, body);
    expect(result).toEqual({
      status: 503,
      body: { data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'A required service is temporarily unavailable.' } },
    });
  });
});

describe('Supabase unreachable — data layer (guards stubbed)', () => {
  // postgrest-js retries idempotent reads 3× (1 s, 2 s, 4 s backoff) on network
  // failure before giving up; fast-forward those waits.
  it.each(cases.filter(([name]) => name !== 'GET /auth/me'))('%s → 503', async (_name, handler, method, body) => {
    state.stubGuards = true;
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let result: Awaited<ReturnType<typeof invoke>>;
    try {
      const pending = invoke(handler, method, body);
      for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(10_000);
      result = await pending;
    } finally {
      vi.useRealTimers();
    }
    expect([result.status, result.body.error?.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
    expect(result.body.data).toBeNull();
  });
});
