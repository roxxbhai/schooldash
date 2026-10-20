import { create } from 'zustand';
import type { AdminShellStore } from '@/types/admin-shell';

/** PORTAL CHROME STATE SHARED BY THE HEADER (OPENS THE DRAWER) AND THE NAVIGATION (CLOSES IT). */
export const adminShellStore = create<AdminShellStore>((set) => ({
  isNavigationOpen: false,

  setIsNavigationOpen: (isNavigationOpen) => set({ isNavigationOpen }),
}));
