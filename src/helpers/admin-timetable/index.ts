import { SUNDAY } from '@/constants/admin-timetable';
import { WEEKDAYS, formatTime } from '@/helpers/format';
import type { TimetableEntry } from '@/types/timetable';

/** MONDAY TO SATURDAY, PLUS SUNDAY ONLY WHEN A PERIOD FALLS ON IT. */
export function visibleWeekdays(entries: readonly TimetableEntry[]) {
  const isSundayUsed = entries.some((entry) => entry.dayOfWeek === SUNDAY);
  return WEEKDAYS.filter((day) => day.value !== SUNDAY || isSundayUsed);
}

/** THE PERIODS OF EACH DAY, IN START-TIME ORDER. */
export function entriesByDay(entries: readonly TimetableEntry[]): Map<number, TimetableEntry[]> {
  const byDay = new Map<number, TimetableEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.dayOfWeek, [...(byDay.get(entry.dayOfWeek) ?? []), entry]);
  }
  for (const dayEntries of byDay.values()) {
    dayEntries.sort((first, second) => first.startTime.localeCompare(second.startTime));
  }
  return byDay;
}

/** "09:00–09:45". */
export function periodTimeRange(entry: Pick<TimetableEntry, 'startTime' | 'endTime'>): string {
  return `${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`;
}
