'use client';

import { CalendarCheckIcon, PenLineIcon, SchoolIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { BackLink } from '@/components/back-link';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { loadClassRoster } from '@/functions/teacher-class-roster';
import { pluralize } from '@/helpers/format';
import { classLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { RosterRow } from '@/types/teacher-class-roster';
import { portalSessionStore } from '@/zustand/portal-session';

/**
 * ONE OF THE TEACHER'S CLASSES: ITS STUDENTS IN ROLL ORDER, WITH ONLY WHAT TEACHING
 * NEEDS (ROLL NUMBER, NAME, ADMISSION NUMBER). A CLASS THEY DON'T TEACH IS "NOT FOUND".
 */
export function TeacherClassRoster() {
  const [search, setSearch] = useState('');

  const { id: classId } = useParams<{ id: string }>();
  const teacherId = portalSessionStore((state) => state.recordId);
  const { classById, academicYearById, isReady } = useReferenceData();

  function load() {
    return loadClassRoster(classId);
  }

  const roster = useAsyncResult(`class-roster|${classId}`, load);

  const schoolClass = classById.get(classId);
  const year = schoolClass ? academicYearById.get(schoolClass.academicYearId) : undefined;
  const term = search.trim().toLowerCase();
  const rows = (roster.data ?? []).filter(
    (row) =>
      !term ||
      (row.student?.user.fullName ?? '').toLowerCase().includes(term) ||
      (row.student?.admissionNumber ?? '').toLowerCase().includes(term) ||
      String(row.enrollment.rollNumber ?? '') === term,
  );

  const columns: DataTableColumn<RosterRow>[] = [
    { key: 'roll', header: 'Roll', className: 'w-16', cell: (row) => <span className='text-sm tabular-nums'>{row.enrollment.rollNumber ?? '—'}</span> },
    {
      key: 'name',
      header: 'Student',
      cell: (row) => (
        <span className='flex flex-wrap items-center gap-2'>
          <Link href={`${ROUTES.teacher.students}/${row.enrollment.studentId}`} className='font-medium text-foreground underline-offset-3 hover:text-primary hover:underline'>
            {row.student?.user.fullName ?? 'Unknown student'}
          </Link>
          {row.student && !row.student.user.isActive && <StatusBadge tone='neutral'>Inactive</StatusBadge>}
        </span>
      ),
    },
    { key: 'admission', header: 'Admission number', cell: (row) => <span className='tabular-nums text-sm'>{row.student?.admissionNumber ?? '—'}</span> },
  ];

  if (isReady && !schoolClass) {
    return (
      <>
        <BackLink href={ROUTES.teacher.classes} label='My classes' />
        <div className='border bg-card shadow-xs'>
          <EmptyState
            icon={SchoolIcon}
            title='Class not found'
            description="This class doesn't exist, or you don't teach it."
            action={
              <Button asChild variant='outline'>
                <Link href={ROUTES.teacher.classes}>Back to my classes</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink href={ROUTES.teacher.classes} label='My classes' />
      <PageHeader
        title={schoolClass ? `Class ${classLabel(schoolClass)}` : 'Class'}
        description={
          <>
            {year?.name}
            {roster.data && ` · ${pluralize(roster.data.length, 'student')}`}
            {schoolClass?.classTeacherId === teacherId && ' · You are the class teacher'}
          </>
        }
        actions={
          <>
            <Button asChild variant='outline'>
              <Link href={`${ROUTES.teacher.attendance}?classId=${classId}`}>
                <CalendarCheckIcon aria-hidden />
                Mark attendance
              </Link>
            </Button>
            <Button asChild variant='outline'>
              <Link href={ROUTES.teacher.marks}>
                <PenLineIcon aria-hidden />
                Enter marks
              </Link>
            </Button>
          </>
        }
      />

      <div className='mb-4'>
        <SearchInput value={search} onChange={setSearch} label='Search students' placeholder='Search by name, admission or roll number' />
      </div>

      {!isReady ? (
        <div className='border bg-card shadow-xs'>
          <ListSkeleton rows={5} />
        </div>
      ) : (
        <DataTable
          label={schoolClass ? `Students of ${classLabel(schoolClass)}` : 'Students'}
          columns={columns}
          rows={roster.data ? rows : null}
          getRowKey={(row) => row.enrollment.id}
          isLoading={roster.isLoading}
          errorMessage={roster.errorMessage}
          onRetry={roster.reload}
          empty={
            term ? (
              <EmptyState icon={UsersIcon} title='No matching students' description='Try a different name, admission number or roll number.' />
            ) : (
              <EmptyState icon={UsersIcon} title='No students yet' description='The school office enrolls students into classes.' />
            )
          }
        />
      )}
    </>
  );
}
