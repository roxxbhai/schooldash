import { ROLE_SIGN_IN_PATHS, ROUTES } from '@/constants/routes';
import type { AppRole } from '@/types/auth';

const PORTAL_PREFIXES: readonly (readonly [string, AppRole])[] = [
  [ROUTES.admin.overview, 'ADMIN'],
  [ROUTES.teacher.overview, 'TEACHER'],
  [ROUTES.student.overview, 'STUDENT'],
];

/** THE PORTAL `pathname` BELONGS TO ("/admin/…" → ADMIN), OR NULL OUTSIDE THE PORTALS. */
export function portalRoleFor(pathname: string): AppRole | null {
  return PORTAL_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

/** THE SIGN-IN PAGE FOR WHOEVER IS USING `pathname`: THE ADMIN PORTAL → ADMIN SIGN-IN, AND SO ON. ELSEWHERE (ROLE UNKNOWN), STUDENT SIGN-IN. */
export function signInPathFor(pathname: string): string {
  const role = portalRoleFor(pathname);
  return role ? ROLE_SIGN_IN_PATHS[role] : ROUTES.studentSignIn;
}
