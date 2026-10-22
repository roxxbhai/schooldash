import { CalendarCheckIcon, CalendarClockIcon, LayoutDashboardIcon, MegaphoneIcon, PenLineIcon, SchoolIcon, UserRoundIcon } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import type { NavigationItem, NavigationSection } from '@/types/portal-shell';

/** THE TEACHER SIDEBAR: SHORT AND TASK-FIRST. */
export const TEACHER_NAVIGATION: readonly NavigationSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Overview', href: ROUTES.teacher.overview, icon: LayoutDashboardIcon, description: 'Your classes and today at a glance.' }],
  },
  {
    label: 'Teaching',
    items: [
      { label: 'My classes', href: ROUTES.teacher.classes, icon: SchoolIcon, description: 'The classes and subjects you teach, and their students.' },
      { label: 'Attendance', href: ROUTES.teacher.attendance, icon: CalendarCheckIcon, description: 'Mark the daily register for your classes.' },
      { label: 'Marks entry', href: ROUTES.teacher.marks, icon: PenLineIcon, description: 'Enter and correct marks for your subjects.' },
    ],
  },
  {
    label: 'Schedule',
    items: [{ label: 'Timetable', href: ROUTES.teacher.timetable, icon: CalendarClockIcon, description: 'Your weekly periods.' }],
  },
  {
    label: 'School',
    items: [{ label: 'Notices', href: ROUTES.teacher.notices, icon: MegaphoneIcon, description: 'Notices from the school office.' }],
  },
  {
    label: 'Account',
    items: [{ label: 'My profile', href: ROUTES.teacher.profile, icon: UserRoundIcon, description: 'Your details and your own attendance.' }],
  },
];

export const TEACHER_NAVIGATION_ITEMS: readonly NavigationItem[] = TEACHER_NAVIGATION.flatMap((section) => section.items);
