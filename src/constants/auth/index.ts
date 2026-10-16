/**
 * ROLES AS EXPOSED BY THE API ('ADMIN', …). THE DATABASE ENUM `userRole` STORES
 * THEM IN LOWERCASE; `toAppRole` / `toDbRole` IN @/helpers/roles ARE THE ONLY
 * PLACE THAT MAPS BETWEEN THE TWO.
 */
export const APP_ROLES = ['ADMIN', 'TEACHER', 'STUDENT'] as const;
export const DB_USER_ROLES = ['admin', 'teacher', 'student'] as const;
