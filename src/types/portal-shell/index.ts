import type { LucideIcon } from 'lucide-react';
import type { AppRole } from '@/types/auth';

/** EVERY ROLE HAS A PORTAL, AND THEY ALL SHARE THE SIDEBAR + HEADER SHELL. */
export type PortalRole = AppRole;

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

/** EVERYTHING THAT DIFFERS BETWEEN THE PORTALS' CHROME. */
export interface PortalConfig {
  role: PortalRole;
  /** SHOWN UNDER THE NAME IN THE ACCOUNT MENU, E.G. "ADMINISTRATOR". */
  roleLabel: string;
  /** ACCESSIBLE NAME OF THE NAVIGATION LANDMARK. */
  navigationLabel: string;
  /** THE OVERVIEW PAGE: HIGHLIGHTED ONLY ON AN EXACT MATCH. */
  homeHref: string;
  sections: readonly NavigationSection[];
  items: readonly NavigationItem[];
}

export interface PortalShellStore {
  isNavigationOpen: boolean;
  /** DESKTOP SIDEBAR SHRUNK TO AN ICON RAIL. KEPT FOR THE SESSION, ACROSS PAGE CHANGES. */
  isSidebarCollapsed: boolean;
  setIsNavigationOpen: (isNavigationOpen: boolean) => void;
  setIsSidebarCollapsed: (isSidebarCollapsed: boolean) => void;
}
