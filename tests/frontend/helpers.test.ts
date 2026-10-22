import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ACADEMIC_YEAR_FORM_SCHEMA } from '@/constants/admin-academic-years';
import {
  ACCOUNT_SETUP_FORM_SCHEMA,
  ADMIN_SIGN_IN_FORM_SCHEMA,
  STUDENT_SIGN_IN_FORM_SCHEMA,
  TEACHER_SIGN_IN_FORM_SCHEMA,
  TEACHER_SIGN_UP_FORM_SCHEMA,
} from '@/constants/auth-forms';
import { PORTALS } from '@/constants/portal-shell';
import { findActiveNavigationItem } from '@/helpers/portal-shell';
import { formatDate, formatMarks, formatTime, initialsOf, isoWeekday, pluralize, shiftIsoDate, todayInSchool } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { formatPhone, normalizePhone } from '@/helpers/phone';
import { portalRoleFor, signInPathFor } from '@/helpers/routes';
import { classLabel, sortClasses, teacherOptions } from '@/helpers/reference-labels';
import type { SchoolClass } from '@/types/classes';
import type { Teacher } from '@/types/teachers';

describe('format helpers', () => {
  it('formats calendar dates without shifting the day', () => {
    expect(formatDate('2026-04-01')).toBe('1 Apr 2026');
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('31 Dec 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it("uses the school's calendar day (Asia/Kolkata) for today", () => {
    // 20:00 UTC IS ALREADY THE NEXT DAY IN INDIA.
    expect(todayInSchool(new Date('2026-10-20T20:00:00Z'))).toBe('2026-10-21');
    expect(todayInSchool(new Date('2026-10-20T10:00:00Z'))).toBe('2026-10-20');
  });

  it('formats times, marks, counts and initials', () => {
    expect(formatTime('09:05:00')).toBe('09:05');
    expect(formatMarks(87.5)).toBe('87.5');
    expect(formatMarks('0')).toBe('0');
    expect(formatMarks(null)).toBe('—');
    expect(pluralize(1, 'student')).toBe('1 student');
    expect(pluralize(1200, 'student')).toBe('1,200 students');
    expect(initialsOf('Asha Rani Verma')).toBe('AV');
    expect(initialsOf('Prakash')).toBe('PR');
  });

  it('numbers weekdays the way the timetable does (1 = Monday, 7 = Sunday)', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-21')).toBe(3);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });

  it('moves a calendar date by whole days across month and year ends', () => {
    expect(shiftIsoDate('2026-10-21', -30)).toBe('2026-09-21');
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftIsoDate('2024-03-01', -1)).toBe('2024-02-29');
  });
});

describe('form helpers', () => {
  it('wires a control to its error, or else its hint', () => {
    expect(fieldControlProps('email', 'Bad')).toEqual({ id: 'email', name: 'email', 'aria-invalid': true, 'aria-describedby': 'email-error' });
    expect(fieldControlProps('code', undefined, true)).toEqual({ id: 'code', name: 'code', 'aria-invalid': undefined, 'aria-describedby': 'code-description' });
  });

  it('maps zod issues to fields and clears one field at a time', () => {
    const parsed = z.object({ a: z.string().min(1, { error: 'A' }), b: z.string().min(1, { error: 'B' }) }).safeParse({ a: '', b: '' });
    if (parsed.success) throw new Error('expected failure');
    expect(zodFieldErrors(parsed.error)).toEqual({ a: 'A', b: 'B' });
    expect(withoutKey({ a: 'A', b: 'B' }, 'a')).toEqual({ b: 'B' });
  });
});

describe('client form schemas', () => {
  it('validates administrator sign-in input', () => {
    expect(ADMIN_SIGN_IN_FORM_SCHEMA.safeParse({ email: ' Name@Example.com ', password: 'x' }).success).toBe(true);
    expect(ADMIN_SIGN_IN_FORM_SCHEMA.safeParse({ email: 'nope', password: '' }).success).toBe(false);
  });

  it('accepts a teacher mobile number in the ways people write it, and sends it normalized', () => {
    for (const phone of ['9876543210', '98765 43210', '+91 98765-43210', '09876543210']) {
      expect(TEACHER_SIGN_IN_FORM_SCHEMA.parse({ phone, password: 'x' }).phone).toBe('9876543210');
    }
    for (const phone of ['', '12345', '5876543210', '0141 234 5678']) {
      expect(TEACHER_SIGN_IN_FORM_SCHEMA.safeParse({ phone, password: 'x' }).success).toBe(false);
    }
  });

  it('requires matching passwords of at least 12 characters for teacher sign-up', () => {
    const valid = { phone: '9876543210', password: 'twelve chars', confirmPassword: 'twelve chars' };
    expect(TEACHER_SIGN_UP_FORM_SCHEMA.safeParse(valid).success).toBe(true);
    const mismatch = TEACHER_SIGN_UP_FORM_SCHEMA.safeParse({ ...valid, confirmPassword: 'other value!' });
    expect(mismatch.success ? [] : mismatch.error.issues.map((issue) => issue.path.join('.'))).toEqual(['confirmPassword']);
  });

  it('needs only an admission number for student sign-in', () => {
    expect(STUDENT_SIGN_IN_FORM_SCHEMA.parse({ admissionNumber: '  EM-014 ' }).admissionNumber).toBe('EM-014');
    expect(STUDENT_SIGN_IN_FORM_SCHEMA.safeParse({ admissionNumber: '   ' }).success).toBe(false);
  });

  it('requires matching passwords of at least 12 characters and a plausible code', () => {
    const valid = { email: 'a@b.co', code: '7k2m q9tb-4hxd', password: 'twelve chars', confirmPassword: 'twelve chars' };
    expect(ACCOUNT_SETUP_FORM_SCHEMA.safeParse(valid).success).toBe(true);
    const mismatch = ACCOUNT_SETUP_FORM_SCHEMA.safeParse({ ...valid, confirmPassword: 'other value!' });
    expect(mismatch.success ? [] : mismatch.error.issues.map((issue) => issue.path.join('.'))).toEqual(['confirmPassword']);
    expect(ACCOUNT_SETUP_FORM_SCHEMA.safeParse({ ...valid, code: 'abc' }).success).toBe(false);
  });

  it('requires an academic year to end after it starts', () => {
    const result = ACADEMIC_YEAR_FORM_SCHEMA.safeParse({ name: '2026–27', startDate: '2026-04-01', endDate: '2026-03-31' });
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))).toEqual(['endDate']);
  });
});

describe('phone numbers and sign-in paths', () => {
  it('normalizes and formats Indian mobile numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('9198765432')).toBe('9198765432');
    expect(normalizePhone('12345')).toBeNull();
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone(null)).toBe('—');
  });

  it('sends each portal to its own sign-in, and everywhere else to student sign-in', () => {
    expect(signInPathFor('/admin')).toBe('/admin/sign-in');
    expect(signInPathFor('/admin/students/1')).toBe('/admin/sign-in');
    expect(signInPathFor('/teacher/attendance')).toBe('/teacher/sign-in');
    expect(signInPathFor('/student')).toBe('/student/sign-in');
    expect(signInPathFor('/administrators')).toBe('/student/sign-in');
    expect(signInPathFor('/elsewhere')).toBe('/student/sign-in');
  });

  it('knows which portal a path belongs to', () => {
    expect(portalRoleFor('/admin/classes')).toBe('ADMIN');
    expect(portalRoleFor('/teacher')).toBe('TEACHER');
    expect(portalRoleFor('/teachers')).toBeNull();
    expect(portalRoleFor('/student/results')).toBe('STUDENT');
    expect(portalRoleFor('/sign-in')).toBeNull();
  });
});

describe('reference labels and navigation', () => {
  const classOf = (name: string, section: string) => ({ name, section }) as SchoolClass;

  it('names and sorts classes naturally', () => {
    expect(classLabel(classOf('10', 'A'))).toBe('10 – A');
    expect(sortClasses([classOf('10', 'A'), classOf('2', 'B'), classOf('2', 'A')]).map(classLabel)).toEqual(['2 – A', '2 – B', '10 – A']);
  });

  it('offers only active teachers, plus the current value even if inactive', () => {
    const teacher = (id: string, fullName: string, isActive: boolean) =>
      ({ id, employeeCode: id.toUpperCase(), user: { fullName, email: '', phone: null, isActive } }) as Teacher;
    const teachers = [teacher('t1', 'Zoya', true), teacher('t2', 'Amit', false), teacher('t3', 'Bina', true)];
    expect(teacherOptions(teachers).map((option) => option.value)).toEqual(['t3', 't1']);
    expect(teacherOptions(teachers, 't2').map((option) => option.value)).toEqual(['t2', 't3', 't1']);
  });

  it('highlights the list for its detail pages, and the dashboard only on an exact match', () => {
    expect(findActiveNavigationItem('/admin', PORTALS.ADMIN)?.label).toBe('Dashboard');
    expect(findActiveNavigationItem('/admin/students/123', PORTALS.ADMIN)?.label).toBe('Students');
    expect(findActiveNavigationItem('/admin/teacher-attendance', PORTALS.ADMIN)?.label).toBe('Teacher attendance');
    expect(findActiveNavigationItem('/elsewhere', PORTALS.ADMIN)).toBeNull();
    expect(findActiveNavigationItem('/teacher', PORTALS.TEACHER)?.label).toBe('Overview');
    expect(findActiveNavigationItem('/admin', PORTALS.TEACHER)).toBeNull();
    expect(findActiveNavigationItem('/student/notices/abc', PORTALS.STUDENT)?.label).toBe('Notices');
    expect(findActiveNavigationItem('/student', PORTALS.STUDENT)?.label).toBe('Overview');
  });
});
