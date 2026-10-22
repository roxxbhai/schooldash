import type { ApiErrorCode } from '@/types/api';

/** EVERY API PATH THE PORTAL CALLS. DYNAMIC SEGMENTS ARE BUILT BY THE FUNCTIONS BELOW. */
export const API_PATHS = {
  auth: {
    adminLogin: '/api/auth/admin/login',
    adminSetup: '/api/auth/admin/setup',
    teacherLogin: '/api/auth/teacher/login',
    teacherSignUp: '/api/auth/teacher/sign-up',
    studentLogin: '/api/auth/student/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
  },
  admins: '/api/admins',
  academicYears: '/api/academic-years',
  subjects: '/api/subjects',
  classes: '/api/classes',
  teachers: '/api/teachers',
  students: '/api/students',
  enrollments: '/api/enrollments',
  teacherAssignments: '/api/teacher-assignments',
  studentAttendance: '/api/student-attendance',
  teacherAttendance: '/api/teacher-attendance',
  exams: '/api/exams',
  examSubjects: '/api/exam-subjects',
  results: '/api/results',
  timetableEntries: '/api/timetable-entries',
  notices: '/api/notices',
  users: '/api/users',
} as const;

/** THE BACKEND'S PAGE SIZE CEILING. */
export const MAX_PAGE_SIZE = 100;

/** SHOWN WHEN THE BROWSER CANNOT REACH THE SERVER AT ALL. */
export const NETWORK_ERROR_MESSAGE = "We couldn't reach the school portal. Check your internet connection and try again.";

/**
 * PLAIN-LANGUAGE MESSAGES FOR ERRORS WHOSE SERVER TEXT IS GENERIC OR TECHNICAL.
 * CODES NOT LISTED HERE (CONFLICT, NOT_FOUND, FORBIDDEN …) CARRY SPECIFIC,
 * CLIENT-SAFE SERVER MESSAGES, WHICH ARE SHOWN AS THEY ARE.
 */
export const ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  BAD_REQUEST: 'Something in the request was not valid. Refresh the page and try again.',
  INVALID_JSON: 'Something in the request was not valid. Refresh the page and try again.',
  VALIDATION_ERROR: 'Some details need your attention. Check the highlighted fields.',
  UNAUTHORIZED: 'Your session has ended. Please sign in again.',
  ACCOUNT_NOT_PROVISIONED: "This account isn't set up for the school portal yet. Please contact the school office.",
  ACCOUNT_INACTIVE: 'This account has been deactivated. Please contact the school office.',
  CSRF_REJECTED: 'This request was blocked for security reasons. Refresh the page and try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  SERVICE_UNAVAILABLE: 'The school portal is temporarily unavailable. Please try again in a few minutes.',
};
