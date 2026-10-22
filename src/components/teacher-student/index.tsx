'use client';

import { RefreshCwIcon, UserRoundXIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AttendanceStatusCounts } from '@/components/attendance-status-counts';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { ReportCardBrowser } from '@/components/report-card-browser';
import { Button } from '@/components/ui/button';
import { API_PATHS } from '@/constants/api-client';
import { ROUTES } from '@/constants/routes';
import { loadAttendanceStatusCounts } from '@/functions/attendance-status-counts';
import { loadTeacherStudent } from '@/functions/teacher-student';
import { formatDate, todayInSchool } from '@/helpers/format';
import { classLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';

/**
 * A STUDENT THE TEACHER TEACHES: WHO THEY ARE (NAME, ADMISSION NUMBER, CLASS, ROLL),
 * THIS YEAR'S ATTENDANCE IN THE TEACHER'S CLASSES, AND THEIR MARKS IN THE TEACHER'S
 * OWN SUBJECTS. NO PERSONAL DETAILS (ADDRESS, PARENTS, DATE OF BIRTH) ARE SHOWN.
 */
export function TeacherStudent() {
  const { id: studentId } = useParams<{ id: string }>();
  const { classById, currentAcademicYear } = useReferenceData();

  const today = todayInSchool();
  const year = currentAcademicYear;
  const attendanceTo = year && year.endDate < today ? year.endDate : today;

  function loadRecord(signal: AbortSignal) {
    return loadTeacherStudent(studentId, signal);
  }

  function loadCounts() {
    return loadAttendanceStatusCounts(API_PATHS.studentAttendance, { studentId }, year?.startDate ?? today, attendanceTo);
  }

  const record = useAsyncResult(`teacher-student|${studentId}`, loadRecord);
  const isVisible = Boolean(record.data);
  const counts = useAsyncResult(isVisible && year && year.startDate <= today ? `teacher-student-counts|${studentId}|${year.id}` : null, loadCounts);

  const student = record.data?.student;
  const currentEnrollment = record.data?.enrollments.find((enrollment) => enrollment.academicYearId === year?.id) ?? null;
  const schoolClass = currentEnrollment ? classById.get(currentEnrollment.classId) : undefined;
  const backHref = schoolClass ? `${ROUTES.teacher.classes}/${schoolClass.id}` : ROUTES.teacher.classes;

  if (record.isInitialLoading) {
    return (
      <>
        <BackLink href={ROUTES.teacher.classes} label='My classes' />
        <div className='border bg-card shadow-xs'>
          <ListSkeleton rows={4} />
        </div>
      </>
    );
  }

  if (record.errorMessage) {
    return (
      <>
        <BackLink href={ROUTES.teacher.classes} label='My classes' />
        <FormAlert tone='error' title="This student couldn't be loaded">
          <span>{record.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={record.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!student) {
    return (
      <>
        <BackLink href={ROUTES.teacher.classes} label='My classes' />
        <div className='border bg-card shadow-xs'>
          <EmptyState
            icon={UserRoundXIcon}
            title='Student not found'
            description="This student doesn't exist, or isn't in a class you teach."
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
      <BackLink href={backHref} label={schoolClass ? `Class ${classLabel(schoolClass)}` : 'My classes'} />
      <PageHeader
        title={student.user.fullName}
        description={
          <span className='font-mono text-sm'>
            {student.admissionNumber}
            {schoolClass && <span className='font-sans'> · Class {classLabel(schoolClass)}</span>}
            {currentEnrollment?.rollNumber ? <span className='font-sans'> · Roll number {currentEnrollment.rollNumber}</span> : null}
          </span>
        }
      />

      <div className='flex flex-col gap-6'>
        <Panel
          title='Attendance this year'
          description={year ? `${year.name}, ${formatDate(year.startDate)} to ${formatDate(attendanceTo)}. Days recorded in your classes.` : undefined}
        >
          {!year ? (
            <p className='text-sm text-muted-foreground'>There is no current academic year.</p>
          ) : (
            <AttendanceStatusCounts counts={counts.data} isLoading={counts.isLoading} label={`${student.user.fullName}'s attendance this year`} />
          )}
        </Panel>

        <section>
          <h2 className='mb-3 text-xl font-semibold tracking-tight text-foreground'>Marks in your subjects</h2>
          <ReportCardBrowser studentId={studentId} />
        </section>
      </div>
    </>
  );
}
