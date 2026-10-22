'use client';

import { CalendarCheckIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { AttendanceStatusCounts } from '@/components/attendance-status-counts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { Panel } from '@/components/panel';
import { ProfileFields } from '@/components/profile-fields';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { API_PATHS } from '@/constants/api-client';
import { ATTENDANCE_FALLBACK_DAYS, ATTENDANCE_HISTORY_PAGE_SIZE } from '@/constants/student-attendance-history';
import { TEACHER_PROFILE_NOTE } from '@/constants/teacher-profile';
import { loadAttendanceStatusCounts } from '@/functions/attendance-status-counts';
import { loadTeacherProfile } from '@/functions/teacher-profile';
import { formatDate, isoWeekday, shiftIsoDate, todayInSchool, weekdayLabel } from '@/helpers/format';
import { formatPhone } from '@/helpers/phone';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { TeacherAttendance } from '@/types/teacher-attendance';
import { portalSessionStore } from '@/zustand/portal-session';

/**
 * THE TEACHER'S OWN RECORD AND THEIR OWN ATTENDANCE THIS YEAR (COUNTS PER STATUS AND
 * EVERY RECORDED DAY). READ-ONLY: ADMINS RECORD TEACHER ATTENDANCE; RLS RETURNS ONLY THEIR OWN DAYS.
 */
export function TeacherProfile() {
  const [page, setPage] = useState(1);

  const teacherId = portalSessionStore((state) => state.recordId);
  const { currentAcademicYear, isReady } = useReferenceData();

  const today = todayInSchool();
  const from = currentAcademicYear?.startDate ?? shiftIsoDate(today, -ATTENDANCE_FALLBACK_DAYS);
  const to = currentAcademicYear && currentAcademicYear.endDate < today ? currentAcademicYear.endDate : today;
  const isRangeReady = isReady && from <= to;

  function loadRecord(signal: AbortSignal) {
    return loadTeacherProfile(teacherId ?? '', signal);
  }

  function loadCounts() {
    return loadAttendanceStatusCounts(API_PATHS.teacherAttendance, {}, from, to);
  }

  const record = useAsyncResult(teacherId ? `teacher-profile|${teacherId}` : null, loadRecord);
  const counts = useAsyncResult(teacherId && isRangeReady ? `teacher-own-counts|${from}|${to}` : null, loadCounts);
  const history = useApiQuery<PaginatedList<TeacherAttendance>>(teacherId && isRangeReady ? API_PATHS.teacherAttendance : null, {
    from,
    to,
    page,
    limit: ATTENDANCE_HISTORY_PAGE_SIZE,
  });

  const teacher = record.data;

  const columns: DataTableColumn<TeacherAttendance>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (entry) => (
        <span className='flex flex-col'>
          <span className='tabular-nums text-sm text-foreground'>{formatDate(entry.attendanceDate)}</span>
          <span className='text-xs text-muted-foreground'>{weekdayLabel(isoWeekday(entry.attendanceDate))}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (entry) => {
        const option = ATTENDANCE_STATUS_OPTIONS.find((candidate) => candidate.value === entry.status);
        return <StatusBadge tone={option?.tone ?? 'neutral'}>{option?.label ?? entry.status}</StatusBadge>;
      },
    },
    { key: 'remarks', header: 'Remarks', cell: (entry) => <span className='text-sm text-muted-foreground'>{entry.remarks ?? '—'}</span> },
  ];

  return (
    <>
      <PageHeader title='My profile' description={TEACHER_PROFILE_NOTE} />

      {record.errorMessage && (
        <FormAlert tone='error' title="Your profile couldn't be loaded" className='mb-6'>
          <span>{record.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={record.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      <div className='flex flex-col gap-6'>
        <Panel title='Details'>
          {!teacher ? (
            <ListSkeleton rows={3} />
          ) : (
            <ProfileFields
              fields={[
                { label: 'Full name', value: teacher.user.fullName },
                { label: 'Employee code', value: teacher.employeeCode, isMono: true },
                { label: 'Sign-in mobile number', value: formatPhone(teacher.user.phone), isMono: true },
                { label: 'Email', value: teacher.user.email, isMono: true },
                { label: 'Qualification', value: teacher.qualification },
                { label: 'Date of joining', value: teacher.dateOfJoining ? formatDate(teacher.dateOfJoining) : null, isMono: true },
              ]}
            />
          )}
        </Panel>

        <section>
          <div className='mb-3 flex flex-wrap items-baseline justify-between gap-2'>
            <h2 className='text-xl font-semibold tracking-tight text-foreground'>My attendance</h2>
            <p className='text-sm text-muted-foreground'>
              {currentAcademicYear ? `${currentAcademicYear.name}, ` : ''}
              {formatDate(from)} to {formatDate(to)}
            </p>
          </div>
          {counts.errorMessage && (
            <FormAlert tone='error' title="The totals couldn't be loaded" className='mb-4'>
              {counts.errorMessage}
            </FormAlert>
          )}
          <div className='mb-4'>
            <AttendanceStatusCounts counts={counts.data} isLoading={counts.isLoading || !isRangeReady} label='Your attendance this year' />
          </div>
          <DataTable
            label='Your attendance history'
            columns={columns}
            rows={history.data?.items ?? null}
            getRowKey={(entry) => entry.id}
            isLoading={history.isLoading}
            errorMessage={history.errorMessage}
            onRetry={history.reload}
            empty={<EmptyState icon={CalendarCheckIcon} title='No attendance recorded' description='The school office records teacher attendance.' />}
            footer={<PaginationBar pagination={history.data?.pagination ?? null} onPageChange={setPage} isDisabled={history.isLoading} noun='days' />}
          />
        </section>
      </div>
    </>
  );
}
