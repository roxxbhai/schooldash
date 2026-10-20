import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** ONE LINE SHOWN UNDER THE PAGE TITLE. */
  description: string;
}

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
}

export interface AdminShellStore {
  isNavigationOpen: boolean;
  setIsNavigationOpen: (isNavigationOpen: boolean) => void;
}
