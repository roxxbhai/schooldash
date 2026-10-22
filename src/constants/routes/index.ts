import type { AppRole } from '@/types/auth';

/** EVERY PAGE PATH IN ONE PLACE; COMPONENTS NEVER HARDCODE PATHS. */
export const ROUTES = {
  home: '/',
  adminSignIn: '/admin/sign-in',
  adminAccountSetup: '/admin/account-setup',
  teacherSignIn: '/teacher/sign-in',
  teacherSignUp: '/teacher/sign-up',
  studentSignIn: '/student/sign-in',
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
    administrators: '/admin/administrators',
  },
  teacher: {
    overview: '/teacher',
    classes: '/teacher/classes',
    students: '/teacher/students',
    attendance: '/teacher/attendance',
    marks: '/teacher/marks',
    timetable: '/teacher/timetable',
    notices: '/teacher/notices',
    profile: '/teacher/profile',
  },
  student: {
    overview: '/student',
    profile: '/student/profile',
    attendance: '/student/attendance',
    timetable: '/student/timetable',
    results: '/student/results',
    notices: '/student/notices',
  },
} as const;

/** WHERE EACH ROLE LANDS AFTER SIGNING IN. */
export const ROLE_HOME_PATHS: Record<AppRole, string> = {
  ADMIN: ROUTES.admin.overview,
  TEACHER: ROUTES.teacher.overview,
  STUDENT: ROUTES.student.overview,
};

/** EACH ROLE'S OWN SIGN-IN PAGE. */
export const ROLE_SIGN_IN_PATHS: Record<AppRole, string> = {
  ADMIN: ROUTES.adminSignIn,
  TEACHER: ROUTES.teacherSignIn,
  STUDENT: ROUTES.studentSignIn,
};

/** WHY A USER WAS SENT BACK TO SIGN-IN; SHOWN AS A NOTICE ABOVE THE FORM. */
export const SIGN_IN_REASONS = {
  sessionExpired: 'session-expired',
  signedOut: 'signed-out',
  inactive: 'inactive',
  notProvisioned: 'not-provisioned',
  passwordSet: 'password-set',
} as const;
