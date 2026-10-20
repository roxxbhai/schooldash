import { ADMIN_NAVIGATION, ADMIN_NAVIGATION_ITEMS } from '@/constants/admin-navigation';
import { ROUTES } from '@/constants/routes';
import type { NavigationItem } from '@/types/admin-shell';

/** THE NAVIGATION ITEM FOR A PATH: THE DASHBOARD ONLY ON AN EXACT MATCH, OTHERWISE THE LONGEST MATCHING PREFIX (SO DETAIL PAGES HIGHLIGHT THEIR LIST). */
export function findActiveNavigationItem(pathname: string): NavigationItem | null {
  if (pathname === ROUTES.admin.overview) return ADMIN_NAVIGATION_ITEMS[0] ?? null;
  const matches = ADMIN_NAVIGATION_ITEMS.filter(
    (item) => item.href !== ROUTES.admin.overview && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return matches.sort((first, second) => second.href.length - first.href.length)[0] ?? null;
}

export function findSectionLabel(item: NavigationItem | null): string | null {
  if (!item) return null;
  return ADMIN_NAVIGATION.find((section) => section.items.includes(item))?.label ?? null;
}
