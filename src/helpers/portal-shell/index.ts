import type { NavigationItem, PortalConfig } from '@/types/portal-shell';

/** THE NAVIGATION ITEM FOR A PATH: THE OVERVIEW ONLY ON AN EXACT MATCH, OTHERWISE THE LONGEST MATCHING PREFIX (SO DETAIL PAGES HIGHLIGHT THEIR LIST). */
export function findActiveNavigationItem(pathname: string, portal: PortalConfig): NavigationItem | null {
  if (pathname === portal.homeHref) return portal.items.find((item) => item.href === portal.homeHref) ?? null;
  const matches = portal.items.filter((item) => item.href !== portal.homeHref && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return matches.sort((first, second) => second.href.length - first.href.length)[0] ?? null;
}
