'use client';

import { CalendarCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { AttendanceStatusCounts } from '@/components/attendance-status-counts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { ATTENDANCE_STATUS_OPTIONS } from '@/constants/admin-attendance';
import { API_PATHS } from '@/constants/api-client';
import { ATTENDANCE_FALLBACK_DAYS, ATTENDANCE_HISTORY_PAGE_SIZE } from '@/constants/student-attendance-history';
import { loadAttendanceStatusCounts } from '@/functions/attendance-status-counts';
import { formatDate, isoWeekday, shiftIsoDate, todayInSchool, weekdayLabel } from '@/helpers/format';
import { fieldControlProps } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AttendanceStatus } from '@/types/admin-attendance';
import type { PaginatedList } from '@/types/api';
import type { StudentAttendance } from '@/types/student-attendance';
import { portalSessionStore } from '@/zustand/portal-session';

const STATUS_FILTER_OPTIONS = ATTENDANCE_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

/**
 * THE STUDENT'S ATTENDANCE: HOW MANY DAYS OF EACH STATUS IN A DATE RANGE, AND
 * EVERY RECORDED DAY, NEWEST FIRST. READ-ONLY. COUNTS ONLY, NO PERCENTAGE: THE
 * SCHOOL HAS NO RULE FOR HOW LATE AND LEAVE DAYS COUNT.
 */
export function StudentAttendanceHistory() {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [page, setPage] = useState(1);

  const studentId = portalSessionStore((state) => state.recordId);
  const { currentAcademicYear, isReady } = useReferenceData();

  const today = todayInSchool();
  // UNTIL CHANGED, THE RANGE IS THE CURRENT ACADEMIC YEAR SO FAR (OR THE LAST 30 DAYS WITHOUT ONE).
  const defaultFrom = currentAcademicYear?.startDate ?? shiftIsoDate(today, -ATTENDANCE_FALLBACK_DAYS);
  const defaultTo = currentAcademicYear && currentAcademicYear.endDate < today ? currentAcademicYear.endDate : today;
  const rangeFrom = from ?? defaultFrom;
  const rangeTo = to ?? defaultTo;
  const isRangeValid = Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);
  const isQueryReady = Boolean(studentId && isReady && isRangeValid);

  const history = useApiQuery<PaginatedList<StudentAttendance>>(isQueryReady ? API_PATHS.studentAttendance : null, {
    studentId,
    from: rangeFrom,
    to: rangeTo,
    status,
    page,
    limit: ATTENDANCE_HISTORY_PAGE_SIZE,
  });

  function loadCounts() {
    return loadAttendanceStatusCounts(API_PATHS.studentAttendance, { studentId }, rangeFrom, rangeTo);
  }

  const counts = useAsyncResult(isQueryReady ? `attendance-counts|${studentId}|${rangeFrom}|${rangeTo}` : null, loadCounts);

  const columns: DataTableColumn<StudentAttendance>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (record) => (
        <span className='flex flex-col'>
          <span className='font-mono text-sm text-foreground'>{formatDate(record.attendanceDate)}</span>
          <span className='text-xs text-muted-foreground'>{weekdayLabel(isoWeekday(record.attendanceDate))}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (record) => {
        const option = ATTENDANCE_STATUS_OPTIONS.find((candidate) => candidate.value === record.status);
        return <StatusBadge tone={option?.tone ?? 'neutral'}>{option?.label ?? record.status}</StatusBadge>;
      },
    },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (record) => <span className='text-sm text-muted-foreground'>{record.remarks ?? '—'}</span>,
    },
  ];

  function handleFromChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFrom(event.target.value);
    setPage(1);
  }

  function handleToChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTo(event.target.value);
    setPage(1);
  }

  function handleStatusChange(value: string | null) {
    setStatus(value as AttendanceStatus | null);
    setPage(1);
  }

  return (
    <>
      <PageHeader title='My attendance' description='Every school day your attendance was recorded. Only the school office and your teachers can change it.' />

      <div className='mb-4 grid gap-3 sm:grid-cols-3 lg:max-w-3xl'>
        <FormField id='attendance-from' label='From'>
          <Input {...fieldControlProps('attendance-from', undefined)} type='date' value={rangeFrom} max={rangeTo} onChange={handleFromChange} className='font-mono' />
        </FormField>
        <FormField id='attendance-to' label='To'>
          <Input {...fieldControlProps('attendance-to', undefined)} type='date' value={rangeTo} min={rangeFrom} onChange={handleToChange} className='font-mono' />
        </FormField>
        <FormField id='attendance-status' label='Status'>
          <OptionSelect
            id='attendance-status'
            value={status}
            onValueChange={handleStatusChange}
            options={STATUS_FILTER_OPTIONS}
            placeholder='All statuses'
            emptyLabel='All statuses'
          />
        </FormField>
      </div>

      {!isRangeValid && (
        <FormAlert tone='error' title='Check the dates' className='mb-4'>
          Choose a start date on or before the end date.
        </FormAlert>
      )}

      {counts.errorMessage && (
        <FormAlert tone='error' title="The totals couldn't be loaded" className='mb-4'>
          {counts.errorMessage}
        </FormAlert>
      )}

      <div className='mb-6'>
        <AttendanceStatusCounts counts={counts.data} isLoading={isRangeValid} label={`Days from ${formatDate(rangeFrom)} to ${formatDate(rangeTo)}`} />
      </div>

      <DataTable
        label='Attendance history'
        columns={columns}
        rows={history.data?.items ?? null}
        getRowKey={(record) => record.id}
        isLoading={history.isLoading}
        errorMessage={history.errorMessage}
        onRetry={history.reload}
        empty={
          <EmptyState
            icon={CalendarCheckIcon}
            title='No attendance in this range'
            description={status ? 'No days with this status. Try another status or date range.' : 'Nothing was recorded between these dates.'}
          />
        }
        footer={<PaginationBar pagination={history.data?.pagination ?? null} onPageChange={setPage} isDisabled={history.isLoading} noun='days' />}
      />
    </>
  );
}
