import "server-only";

/**
 * Application roles as exposed by the API (`"ADMIN"`, …). The database enum
 * `userRole` stores them in lowercase (`'admin'`, …); `toAppRole` is the only
 * place that maps between the two.
 */
export const APP_ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const DB_USER_ROLES = ["admin", "teacher", "student"] as const;
export type DbUserRole = (typeof DB_USER_ROLES)[number];

const DB_TO_APP_ROLE: Record<DbUserRole, AppRole> = {
  admin: "ADMIN",
  teacher: "TEACHER",
  student: "STUDENT",
};

export function toAppRole(role: DbUserRole): AppRole {
  return DB_TO_APP_ROLE[role];
}

export function toDbRole(role: AppRole): DbUserRole {
  return role.toLowerCase() as DbUserRole;
}
