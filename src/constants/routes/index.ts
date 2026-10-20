import type { AppRole } from '@/types/auth';

/** EVERY PAGE PATH IN ONE PLACE; COMPONENTS NEVER HARDCODE PATHS. */
export const ROUTES = {
  home: '/',
  signIn: '/sign-in',
  accountSetup: '/account-setup',
  accessDenied: '/access-denied',
  admin: {
    overview: '/admin',
    academicYears: '/admin/academic-years',
    classes: '/admin/classes',
    subjects: '/admin/subjects',
    students: '/admin/students',
    teachers: '/admin/teachers',
    enrollments: '/admin/enrollments',
    teacherAssignments: '/admin/teacher-assignments',
    studentAttendance: '/admin/student-attendance',
    teacherAttendance: '/admin/teacher-attendance',
    exams: '/admin/exams',
    results: '/admin/results',
    reportCards: '/admin/report-cards',
    timetable: '/admin/timetable',
    notices: '/admin/notices',
  },
} as const;

/** WHERE EACH ROLE LANDS AFTER SIGNING IN. TEACHER AND STUDENT PORTALS ARE LATER PHASES. */
export const ROLE_HOME_PATHS: Record<AppRole, string> = {
  ADMIN: ROUTES.admin.overview,
  TEACHER: ROUTES.accessDenied,
  STUDENT: ROUTES.accessDenied,
};

/** WHY A USER WAS SENT BACK TO SIGN-IN; SHOWN AS A NOTICE ABOVE THE FORM. */
export const SIGN_IN_REASONS = {
  sessionExpired: 'session-expired',
  signedOut: 'signed-out',
  inactive: 'inactive',
  notProvisioned: 'not-provisioned',
  passwordSet: 'password-set',
} as const;
