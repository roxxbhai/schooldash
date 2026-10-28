import { Skeleton } from '@/components/ui/skeleton';
import { entriesByDay, visibleWeekdays } from '@/helpers/admin-timetable';
import { cn } from '@/helpers/cn';
import type { TimetableEntry } from '@/types/timetable';

interface TimetableWeekProps {
  entries: readonly TimetableEntry[];
  renderPeriod: (entry: TimetableEntry) => React.ReactNode;
  /** ISO WEEKDAY TO MARK AS TODAY (1 = MONDAY), IF ANY. */
  today?: number;
}

/** THE WEEK AS COLUMNS ON WIDE SCREENS AND AS A DAY-BY-DAY LIST BELOW `lg`. SHARED BY EVERY PORTAL'S TIMETABLE. */
export function TimetableWeek({ entries, renderPeriod, today }: TimetableWeekProps) {
  const days = visibleWeekdays(entries);
  const byDay = entriesByDay(entries);

  return (
    <>
      <div className={cn('hidden rounded-xl bg-card shadow-xs lg:grid', days.length === 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6')}>
        {days.map((day) => {
          const isToday = day.value === today;
          return (
            <section key={day.value} aria-label={isToday ? `${day.label}, today` : day.label} className='flex min-w-0 flex-col border-r last:border-r-0'>
              <h3
                className={cn(
                  'flex items-baseline justify-between border-b px-3 py-2 text-xs font-medium',
                  isToday ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-muted-foreground',
                )}
              >
                {day.label}
                {isToday && <span className='tabular-nums text-2xs uppercase'>Today</span>}
              </h3>
              <div className={cn('flex min-h-48 flex-col gap-2 p-2', isToday && 'bg-background')}>
                {(byDay.get(day.value) ?? []).map((entry) => (
                  <div key={entry.id}>{renderPeriod(entry)}</div>
                ))}
                {!byDay.has(day.value) && <p className='px-1 py-2 text-xs text-muted-foreground'>No periods</p>}
              </div>
            </section>
          );
        })}
      </div>

      <div className='flex flex-col gap-4 lg:hidden'>
        {days.map((day) => {
          const isToday = day.value === today;
          return (
            <section key={day.value} aria-label={isToday ? `${day.label}, today` : day.label} className={cn('rounded-xl bg-card shadow-xs', isToday && 'ring-2 ring-primary/25')}>
              <h3
                className={cn(
                  'flex items-baseline justify-between border-b px-4 py-2 text-sm font-medium text-foreground',
                  isToday ? 'bg-primary text-primary-foreground' : 'bg-surface-muted',
                )}
              >
                <span>
                  {day.label}
                  {isToday && <span className='ml-2 tabular-nums text-2xs text-primary-foreground/80 uppercase'>Today</span>}
                </span>
                <span className={cn('text-xs font-normal', isToday ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{(byDay.get(day.value) ?? []).length || 'No'} periods</span>
              </h3>
              {byDay.has(day.value) && (
                <div className='grid gap-2 p-3 sm:grid-cols-2'>
                  {(byDay.get(day.value) ?? []).map((entry) => (
                    <div key={entry.id}>{renderPeriod(entry)}</div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function TimetableSkeleton() {
  return (
    <div className='grid gap-2 rounded-xl bg-card shadow-xs p-3 sm:grid-cols-2 lg:grid-cols-6' aria-busy>
      {Array.from({ length: 12 }, (_, index) => (
        <Skeleton key={index} className='h-24 w-full' />
      ))}
    </div>
  );
}
