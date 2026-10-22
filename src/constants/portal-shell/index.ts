import { ADMIN_NAVIGATION, ADMIN_NAVIGATION_ITEMS } from '@/constants/admin-navigation';
import { ROUTES } from '@/constants/routes';
import { STUDENT_NAVIGATION, STUDENT_NAVIGATION_ITEMS } from '@/constants/student-navigation';
import { TEACHER_NAVIGATION, TEACHER_NAVIGATION_ITEMS } from '@/constants/teacher-navigation';
import type { PortalConfig, PortalRole } from '@/types/portal-shell';

/** ONE SHELL, ONE CONFIGURATION PER PORTAL. */
export const PORTALS: Record<PortalRole, PortalConfig> = {
  ADMIN: {
    role: 'ADMIN',
    roleLabel: 'Administrator',
    navigationLabel: 'Admin',
    homeHref: ROUTES.admin.overview,
    sections: ADMIN_NAVIGATION,
    items: ADMIN_NAVIGATION_ITEMS,
  },
  TEACHER: {
    role: 'TEACHER',
    roleLabel: 'Teacher',
    navigationLabel: 'Teacher',
    homeHref: ROUTES.teacher.overview,
    sections: TEACHER_NAVIGATION,
    items: TEACHER_NAVIGATION_ITEMS,
  },
  STUDENT: {
    role: 'STUDENT',
    roleLabel: 'Student',
    navigationLabel: 'Student',
    homeHref: ROUTES.student.overview,
    sections: STUDENT_NAVIGATION,
    items: STUDENT_NAVIGATION_ITEMS,
  },
};
