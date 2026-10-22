import { AwardIcon, CalendarCheckIcon, CalendarClockIcon, LayoutDashboardIcon, MegaphoneIcon, UserRoundIcon } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import type { NavigationItem, NavigationSection } from '@/types/portal-shell';

/** THE STUDENT SIDEBAR: A FEW READ-ONLY SECTIONS. A SECTION APPEARS HERE ONCE ITS PAGE EXISTS. */
export const STUDENT_NAVIGATION: readonly NavigationSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Overview', href: ROUTES.student.overview, icon: LayoutDashboardIcon, description: 'Your class and today at a glance.' }],
  },
  {
    label: 'My school',
    items: [
      { label: 'My attendance', href: ROUTES.student.attendance, icon: CalendarCheckIcon, description: 'Every day the school recorded for you.' },
      { label: 'My timetable', href: ROUTES.student.timetable, icon: CalendarClockIcon, description: "Your class's weekly periods." },
      { label: 'Results', href: ROUTES.student.results, icon: AwardIcon, description: 'Your marks, exam by exam.' },
    ],
  },
  {
    label: 'School',
    items: [{ label: 'Notices', href: ROUTES.student.notices, icon: MegaphoneIcon, description: 'Notices from the school.' }],
  },
  {
    label: 'Account',
    items: [{ label: 'My profile', href: ROUTES.student.profile, icon: UserRoundIcon, description: 'Your details as recorded by the school.' }],
  },
];

export const STUDENT_NAVIGATION_ITEMS: readonly NavigationItem[] = STUDENT_NAVIGATION.flatMap((section) => section.items);
