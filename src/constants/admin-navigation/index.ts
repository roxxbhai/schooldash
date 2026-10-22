import {
  AwardIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  ClipboardListIcon,
  FileTextIcon,
  GraduationCapIcon,
  HouseIcon,
  LinkIcon,
  MegaphoneIcon,
  PenLineIcon,
  SchoolIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import type { NavigationItem, NavigationSection } from '@/types/portal-shell';

/** THE ADMIN SIDEBAR, GROUPED BY HOW THE SCHOOL OFFICE THINKS ABOUT ITS WORK. */
export const ADMIN_NAVIGATION: readonly NavigationSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Today', href: ROUTES.admin.overview, icon: HouseIcon, description: 'What needs you today, and what is coming up.' }],
  },
  {
    label: 'Academic',
    items: [
      { label: 'Academic years', href: ROUTES.admin.academicYears, icon: CalendarRangeIcon, description: 'School years and which one is current.' },
      { label: 'Classes', href: ROUTES.admin.classes, icon: SchoolIcon, description: 'Classes and sections for each academic year.' },
      { label: 'Subjects', href: ROUTES.admin.subjects, icon: BookOpenIcon, description: 'Subjects taught across the school.' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', href: ROUTES.admin.students, icon: GraduationCapIcon, description: 'Student records and portal accounts.' },
      { label: 'Teachers', href: ROUTES.admin.teachers, icon: UsersIcon, description: 'Teaching staff and portal accounts.' },
      { label: 'Enrollments', href: ROUTES.admin.enrollments, icon: ClipboardListIcon, description: 'Which class each student is in, by year.' },
      { label: 'Teacher assignments', href: ROUTES.admin.teacherAssignments, icon: LinkIcon, description: 'Who teaches which subject to which class.' },
      { label: 'Administrators', href: ROUTES.admin.administrators, icon: ShieldCheckIcon, description: 'School office staff who use this portal.' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { label: 'Student attendance', href: ROUTES.admin.studentAttendance, icon: CalendarCheckIcon, description: 'Mark and review daily attendance by class.' },
      { label: 'Teacher attendance', href: ROUTES.admin.teacherAttendance, icon: UserCheckIcon, description: 'Daily attendance for teaching staff.' },
    ],
  },
  {
    label: 'Exams & results',
    items: [
      { label: 'Exams', href: ROUTES.admin.exams, icon: FileTextIcon, description: 'Exams and the papers set for each class.' },
      { label: 'Marks entry', href: ROUTES.admin.results, icon: PenLineIcon, description: 'Enter and correct marks paper by paper.' },
      { label: 'Report cards', href: ROUTES.admin.reportCards, icon: AwardIcon, description: "A student's marks for an exam." },
    ],
  },
  {
    label: 'Schedule',
    items: [{ label: 'Timetable', href: ROUTES.admin.timetable, icon: CalendarClockIcon, description: 'Weekly periods for each class.' }],
  },
  {
    label: 'Communication',
    items: [{ label: 'Notices', href: ROUTES.admin.notices, icon: MegaphoneIcon, description: 'Draft, publish and archive school notices.' }],
  },
];

export const ADMIN_NAVIGATION_ITEMS: readonly NavigationItem[] = ADMIN_NAVIGATION.flatMap((section) => section.items);
