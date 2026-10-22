import { create } from 'zustand';
import type { PortalShellStore } from '@/types/portal-shell';

/** PORTAL CHROME STATE: THE MOBILE DRAWER (OPENED BY THE HEADER, CLOSED BY THE NAVIGATION) AND THE COLLAPSIBLE DESKTOP SIDEBAR. */
export const portalShellStore = create<PortalShellStore>((set) => ({
  isNavigationOpen: false,
  isSidebarCollapsed: false,

  setIsNavigationOpen: (isNavigationOpen) => set({ isNavigationOpen }),
  setIsSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
}));
