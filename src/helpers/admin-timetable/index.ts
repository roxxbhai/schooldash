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

function toMinutes(time: string): number {
  const [hours, minutes] = formatTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

/**
 * A NEW PERIOD'S TIMES FOR ONE CLASS ON `dayOfWeek`: RIGHT AFTER THAT DAY'S LAST
 * PERIOD, AS LONG AS IT. ON A DAY WITH NO PERIODS YET, THE CLASS'S EARLIEST PERIOD
 * OF THE WEEK. BLANK WHEN NOTHING IS KNOWN (OR THE PERIOD WOULD PASS MIDNIGHT).
 */
export function suggestNextPeriod(classEntries: readonly TimetableEntry[], dayOfWeek: number): { startTime: string; endTime: string } {
  const dayEntries = classEntries.filter((entry) => entry.dayOfWeek === dayOfWeek);
  if (dayEntries.length === 0) {
    const earliest = [...classEntries].sort((first, second) => first.startTime.localeCompare(second.startTime))[0];
    return earliest ? { startTime: formatTime(earliest.startTime), endTime: formatTime(earliest.endTime) } : { startTime: '', endTime: '' };
  }
  const last = dayEntries.reduce((latest, entry) => (entry.endTime > latest.endTime ? entry : latest));
  const start = toMinutes(last.endTime);
  const end = start + toMinutes(last.endTime) - toMinutes(last.startTime);
  return { startTime: fromMinutes(start), endTime: end < 24 * 60 ? fromMinutes(end) : '' };
}
