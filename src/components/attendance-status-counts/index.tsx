import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { formatNumber } from '@/helpers/format';
import type { AttendanceStatusCounts as Counts } from '@/types/attendance-status-counts';

interface AttendanceStatusCountsProps {
  counts: Counts | null;
  isLoading: boolean;
  /** NAMES THE LIST FOR SCREEN READERS, E.G. "DAYS FROM 1 APR 2026 TO 21 OCT 2026". */
  label: string;
}

/** ONE TILE PER ATTENDANCE STATUS WITH ITS NUMBER OF DAYS. COUNTS ONLY, NEVER A PERCENTAGE. */
export function AttendanceStatusCounts({ counts, isLoading, label }: AttendanceStatusCountsProps) {
  return (
    <dl className='grid grid-cols-2 gap-3 md:grid-cols-4' aria-label={label}>
      {ATTENDANCE_STATUS_OPTIONS.map((option) => (
        <div key={option.value} className='rounded-xl bg-card shadow-xs px-4 py-3'>
          <dt>
            <StatusBadge tone={option.tone}>{option.label}</StatusBadge>
          </dt>
          <dd className='mt-2 text-2xl font-semibold text-foreground tabular-nums'>
            {counts ? formatNumber(counts[option.value]) : isLoading ? <Skeleton className='h-8 w-12' /> : '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
