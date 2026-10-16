import 'server-only';
import type { AppRole, DbUserRole } from '@/types/auth';

const DB_TO_APP_ROLE: Record<DbUserRole, AppRole> = {
  admin: 'ADMIN',
  teacher: 'TEACHER',
  student: 'STUDENT',
};

const APP_TO_DB_ROLE: Record<AppRole, DbUserRole> = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
};

/** THE DATABASE ENUM IS LOWERCASE; THE API IS UPPERCASE. MAP ONLY THROUGH THESE. */
export function toAppRole(role: DbUserRole): AppRole {
  return DB_TO_APP_ROLE[role];
}

export function toDbRole(role: AppRole): DbUserRole {
  return APP_TO_DB_ROLE[role];
}
