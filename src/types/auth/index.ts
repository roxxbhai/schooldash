import type { APP_ROLES, DB_USER_ROLES } from '@/constants/auth';

export type AppRole = (typeof APP_ROLES)[number];
export type DbUserRole = (typeof DB_USER_ROLES)[number];

/** AN ACTIVE, PROVISIONED APPLICATION USER FOR THE CURRENT REQUEST. */
export interface AppUser {
  /** `users.id`. USE IT FOR markedByUserId, enteredByUserId, createdByUserId — NEVER A VALUE FROM THE REQUEST. */
  id: string;
  authUserId: string;
  role: AppRole;
  isActive: true;
  fullName: string;
  email: string;
}

/** THE FIELDS RETURNED TO CLIENTS BY /api/auth/me AND /api/auth/login. */
export interface SessionProfile {
  id: string;
  role: AppRole;
  isActive: boolean;
  fullName: string;
  email: string;
}

export interface PasswordCredentials {
  email: string;
  password: string;
}

/** THE `users` ROW BEHIND A SUPABASE AUTH IDENTITY. */
export interface AppUserRecord {
  id: string;
  authUserId: string;
  role: DbUserRole;
  isActive: boolean;
  fullName: string;
  email: string;
}

export interface TeacherAssignmentQuery {
  teacherId: string;
  classId: string;
  subjectId?: string;
}

export interface StudentAccess {
  user: AppUser;
  studentId: string;
  grantedBy: 'owner' | 'admin';
}

export interface TeacherAssignmentAccess {
  user: AppUser;
  teacherId: string;
  classId: string;
  subjectId?: string;
}
