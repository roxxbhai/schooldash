'use client';

import { SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { MIN_PEOPLE_SEARCH_LENGTH } from '@/constants/command-palette';
import { PORTALS } from '@/constants/portal-shell';
import { ROUTES } from '@/constants/routes';
import { searchPeople } from '@/functions/command-palette';
import { toSearchTerm } from '@/helpers/api-client';
import { matchCommandItem } from '@/helpers/command-palette';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { PortalRole } from '@/types/portal-shell';

/** THE PLATFORM NEVER CHANGES WHILE THE PAGE IS OPEN, SO THERE IS NOTHING TO SUBSCRIBE TO. */
function subscribeToNothing() {
  return function unsubscribe() {};
}

/** APPLE DEVICES USE ⌘; EVERYTHING ELSE (WINDOWS, LINUX, CHROMEOS) USES CTRL. */
function shortcutModifier(): 'mac' | 'other' {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /Macintosh|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'other';
}

/** THE SERVER CAN'T KNOW THE DEVICE, SO IT RENDERS NO HINT; THE BROWSER FILLS IT IN ON HYDRATION. */
function shortcutModifierOnServer(): null {
  return null;
}

interface CommandPaletteProps {
  role: PortalRole;
}

/**
 * ⌘K / CTRL+K FROM ANYWHERE IN A PORTAL: JUMP TO ANY PAGE BY NAME, AND (FOR
 * ADMINS) FIND A STUDENT OR TEACHER AND OPEN THEIR RECORD. THE HEADER SHOWS A
 * SEARCH FIELD THAT OPENS IT, SO IT IS DISCOVERABLE WITHOUT THE SHORTCUT.
 */
export function CommandPalette({ role }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const router = useRouter();
  const modifier = useSyncExternalStore(subscribeToNothing, shortcutModifier, shortcutModifierOnServer);
  const debouncedTerm = useDebouncedValue(toSearchTerm(query), 200);

  const portal = PORTALS[role];
  const isPeopleSearchEnabled = role === 'ADMIN' && isOpen && debouncedTerm.length >= MIN_PEOPLE_SEARCH_LENGTH;

  function loadPeople(signal: AbortSignal) {
    return searchPeople(debouncedTerm, signal);
  }

  const people = useAsyncResult(isPeopleSearchEnabled ? `people|${debouncedTerm}` : null, loadPeople);
  const students = isPeopleSearchEnabled ? (people.data?.students ?? []) : [];
  const teachers = isPeopleSearchEnabled ? (people.data?.teachers ?? []) : [];

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) setQuery('');
  }

  function openPalette() {
    handleOpenChange(true);
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setIsOpen((current) => !current);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    // ONE ELEMENT, SO THE HEADER GRID SEES A SINGLE CENTRE CELL (THE DIALOG'S HIDDEN TITLE RENDERS IN HERE TOO).
    <div className='flex shrink-0 justify-center'>
      <button
        type='button'
        onClick={openPalette}
        aria-keyshortcuts={modifier === 'mac' ? 'Meta+K' : 'Control+K'}
        className='hidden h-8 w-72 items-center xl:w-80 gap-2 border bg-card px-2.5 text-sm text-muted-foreground transition-[border-color,transform] duration-100 hover:border-border-strong active:scale-[0.99] md:flex'
      >
        <SearchIcon aria-hidden className='size-3.5 opacity-70' />
        <span className='flex-1 text-left'>Search or jump to…</span>
        {modifier && (
          <span className='flex items-center gap-0.5' aria-hidden>
            <kbd className='min-w-5 border bg-background px-1 py-px text-center font-sans text-2xs text-muted-foreground'>{modifier === 'mac' ? '⌘' : 'Ctrl'}</kbd>
            <kbd className='min-w-5 border bg-background px-1 py-px text-center font-sans text-2xs text-muted-foreground'>K</kbd>
          </span>
        )}
      </button>
      <Button type='button' variant='ghost' size='icon' className='md:hidden' aria-label='Search or jump to' onClick={openPalette}>
        <SearchIcon aria-hidden />
      </Button>

      <CommandDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title='Search or jump to'
        description={role === 'ADMIN' ? 'Find a page, a student or a teacher.' : 'Find a page.'}
        className='top-[16vh] border-border bg-popover/95 shadow-[0_24px_60px_-16px_rgb(16_40_74/0.35)] backdrop-blur-xl sm:max-w-xl'
      >
        <Command loop filter={matchCommandItem} className='bg-transparent [&_[data-slot=command-item]>svg:last-child]:hidden'>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={role === 'ADMIN' ? 'Search pages, students or teachers…' : 'Search pages…'}
            className='h-11 text-[0.9375rem]'
          />
          <CommandList className='max-h-[min(60vh,26rem)] p-1.5'>
            <CommandEmpty className='py-8 text-sm text-muted-foreground'>
              {isPeopleSearchEnabled && people.isLoading ? 'Searching…' : 'No matches.'}
            </CommandEmpty>

            {students.length > 0 && (
              <CommandGroup heading='Students'>
                {students.map((student) => (
                  <CommandItem
                    key={student.id}
                    value={`student:${student.id}`}
                    keywords={[student.user.fullName, student.admissionNumber, student.user.email]}
                    onSelect={() => go(`${ROUTES.admin.students}/${encodeURIComponent(student.id)}`)}
                  >
                    <span className='truncate'>{student.user.fullName}</span>
                    <span className='ml-auto tabular-nums text-xs text-muted-foreground'>{student.admissionNumber}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {teachers.length > 0 && (
              <CommandGroup heading='Teachers'>
                {teachers.map((teacher) => (
                  <CommandItem
                    key={teacher.id}
                    value={`teacher:${teacher.id}`}
                    keywords={[teacher.user.fullName, teacher.employeeCode, teacher.user.email, teacher.user.phone ?? '']}
                    onSelect={() => go(`${ROUTES.admin.teachers}/${encodeURIComponent(teacher.id)}`)}
                  >
                    <span className='truncate'>{teacher.user.fullName}</span>
                    <span className='ml-auto tabular-nums text-xs text-muted-foreground'>{teacher.employeeCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {portal.sections.map((section) => (
              <CommandGroup key={section.label} heading={section.label}>
                {section.items.map((item) => (
                  <CommandItem key={item.href} value={`page:${item.href}`} keywords={[item.label, section.label]} onSelect={() => go(item.href)}>
                    <span className='truncate'>{item.label}</span>
                    <span className='ml-auto hidden truncate pl-4 text-xs text-muted-foreground sm:block'>{item.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
