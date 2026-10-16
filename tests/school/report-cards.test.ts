import { beforeEach, describe, expect, it, vi } from 'vitest';

// UNIT TESTS OF REPORT-CARD DATA: THE REAL ROUTE AND CALCULATION, A RECORDING
// FAKE DATABASE CLIENT AND STUBBED GUARDS. NO SUPABASE.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));
vi.mock('@/helpers/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/functions/authorization', async (original) => ({
  ...(await original<typeof import('@/functions/authorization')>()),
  ...(await import('../helpers/route-harness')).guardMocks(),
  findTeacherIdByUserId: vi.fn(),
  teachesClass: vi.fn(),
  requireStudentOwnership: vi.fn(async () => ({ success: true, message: '', data: null })),
}));

import * as reportCard from '@/app/api/students/[id]/report-cards/[examId]/route';
import { findTeacherIdByUserId, requireStudentOwnership, teachesClass } from '@/functions/authorization';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import { fakeDb } from '../helpers/fake-db';
import { okResult } from '../helpers/function-result';
import { actAs, callRoute, makeUser } from '../helpers/route-harness';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = makeUser('ADMIN', ID(1));
const teacher = makeUser('TEACHER', ID(2));
const student = makeUser('STUDENT', ID(3));
const STUDENT_ID = ID(10);
const EXAM_ID = ID(20);
const CLASS_ID = ID(30);
function paper(n: number, code: string, max: number) {
  return { id: ID(100 + n), subjectId: ID(200 + n), maxMarks: max, passMarks: null, examDate: null, subject: { code, name: code } };
}
const PAPERS = [paper(1, 'ENG', 33.33), paper(2, 'MATH', 33.33), paper(3, 'SCI', 33.34)];
function mark(n: number, marks: number) {
  return { examSubjectId: ID(100 + n), marksObtained: marks, remarks: null };
}
let db: ReturnType<typeof fakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client);
  db.respondTo('students.select', { data: { id: STUDENT_ID, admissionNumber: 'A1', user: { fullName: 'Asha' } } });
  db.respondTo('exams.select', { data: { id: EXAM_ID, name: 'Term 1', academicYearId: ID(40), startDate: null, endDate: null } });
  db.respondTo('classes.select', { data: { id: CLASS_ID, name: '10', section: 'A' } });
  actAs(admin);
});

function seed({ enrolled = true, papers = PAPERS as unknown[], marks = [] as unknown[] } = {}) {
  db.respondTo('studentEnrollments.select', { data: enrolled ? { classId: CLASS_ID } : null });
  db.respondTo('examSubjects.select', { data: papers });
  db.respondTo('results.select', { data: marks });
}

const getCard = () => callRoute(reportCard.GET, { params: { id: STUDENT_ID, examId: EXAM_ID } });

describe('totals', () => {
  it('are exact when complete (no floating-point drift) and include zero marks', async () => {
    seed({ marks: [mark(1, 33.33), mark(2, 0), mark(3, 33.34)] });
    const card = (await getCard()).body.data;
    expect(card.summary).toEqual({ subjectsConfigured: 3, subjectsWithMarks: 3, complete: true, totalMarksObtained: 66.67, totalMaxMarks: 100 });
    expect(0.1 + 0.2).not.toBe(0.3); // THE DRIFT THE HUNDREDTHS ARITHMETIC AVOIDS
  });

  it('are null when any mark is missing; missing marks are not zero', async () => {
    seed({ marks: [mark(1, 30), mark(3, 20)] });
    const card = (await getCard()).body.data;
    expect(card.summary).toMatchObject({ subjectsWithMarks: 2, complete: false, totalMarksObtained: null, totalMaxMarks: null });
    expect(card.subjects.find((subject: { subjectCode: string }) => subject.subjectCode === 'MATH')).toMatchObject({ marksObtained: null, status: 'notEntered' });
  });

  it('a card with no configured subjects is not complete', async () => {
    seed({ papers: [] });
    const card = (await getCard()).body.data;
    expect(card.summary).toMatchObject({ subjectsConfigured: 0, complete: false, totalMarksObtained: null });
    expect(db.callsTo('results')).toHaveLength(0);
  });

  it('returns subjects ordered by code with maxMarks/passMarks as configured; no percentage or grade', async () => {
    seed();
    const card = (await getCard()).body.data;
    expect(card.subjects.map((subject: { subjectCode: string }) => subject.subjectCode)).toEqual(['ENG', 'MATH', 'SCI']);
    expect(card).not.toHaveProperty('percentage');
    expect(card.summary).not.toHaveProperty('grade');
  });
});

describe('access', () => {
  it('a student is checked for ownership first', async () => {
    seed();
    actAs(student);
    await getCard();
    expect(requireStudentOwnership).toHaveBeenCalledWith(db.client, STUDENT_ID);
  });

  it('a teacher sees only assigned subjects and never totals', async () => {
    seed({ marks: [mark(2, 30)] });
    db.respondTo('teacherAssignments.select', { data: [{ subjectId: ID(202) }] });
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(true));
    vi.mocked(findTeacherIdByUserId).mockResolvedValue(okResult(ID(5)));
    const card = (await getCard()).body.data;
    expect(card.scope).toBe('assignedSubjects');
    expect(card.subjects.map((subject: { subjectCode: string }) => subject.subjectCode)).toEqual(['MATH']);
    expect(card.summary).toMatchObject({ complete: false, totalMarksObtained: null });
  });

  it("a teacher who doesn't teach the student's class that year gets 403", async () => {
    seed();
    actAs(teacher);
    vi.mocked(teachesClass).mockResolvedValue(okResult(false));
    expect((await getCard()).status).toBe(403);
    expect(teachesClass).toHaveBeenCalledWith(db.client, teacher, { classId: CLASS_ID });
  });

  it("404 when the student wasn't enrolled in the exam's academic year", async () => {
    seed({ enrolled: false });
    expect((await getCard()).status).toBe(404);
  });
});
