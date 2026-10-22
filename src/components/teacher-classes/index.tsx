'use client';

import { CalendarCheckIcon, RefreshCwIcon, SchoolIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { ListSkeleton } from '@/components/list-skeleton';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { loadTeacherClasses } from '@/functions/teacher-classes';
import { pluralize } from '@/helpers/format';
import { academicYearOptions, classLabel, sortClasses, subjectLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import { portalSessionStore } from '@/zustand/portal-session';

/**
 * THE CLASSES THE TEACHER TEACHES IN A YEAR (RLS: NO OTHERS ARE VISIBLE), WITH THEIR
 * SUBJECTS, CLASS-TEACHER ROLE AND HOW MANY STUDENTS ARE ENROLLED. READ-ONLY: ONLY
 * THE SCHOOL OFFICE ASSIGNS TEACHERS.
 */
export function TeacherClasses() {
  const [yearChoice, setYearChoice] = useState<string | null>(null);

  const teacherId = portalSessionStore((state) => state.recordId);
  const { academicYears, classes, subjectById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const yearId = yearChoice ?? currentAcademicYear?.id ?? null;
  // ONLY YEARS IN WHICH THE TEACHER HAS A CLASS ARE OFFERED.
  const teachingYears = academicYears.filter((year) => classes.some((schoolClass) => schoolClass.academicYearId === year.id));
  const yearClasses = sortClasses(classes.filter((schoolClass) => schoolClass.academicYearId === yearId));
  const classIds = yearClasses.map((schoolClass) => schoolClass.id);

  function load() {
    return loadTeacherClasses(classIds);
  }

  const data = useAsyncResult(isReady && teacherId ? `teacher-classes|${yearId ?? ''}|${classIds.join(',')}` : null, load);

  const isLoading = !isReady || !teacherId || data.isInitialLoading;

  return (
    <>
      <PageHeader title='My classes' description='The classes and subjects the school office has assigned to you.' />

      {(referenceError || data.errorMessage) && (
        <FormAlert tone='error' title="Your classes couldn't be loaded" className='mb-4'>
          <span>{referenceError ?? data.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={data.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      {teachingYears.length > 1 && (
        <div className='mb-4 max-w-xs'>
          <FormField id='classes-year' label='Academic year'>
            <OptionSelect id='classes-year' value={yearId} onValueChange={setYearChoice} options={academicYearOptions(teachingYears)} placeholder='Academic year' />
          </FormField>
        </div>
      )}

      <div className='border bg-card shadow-xs'>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : yearClasses.length === 0 ? (
          <EmptyState icon={SchoolIcon} title='No classes this year' description='Once the school office assigns you to a class, it appears here.' />
        ) : (
          <ul className='divide-y'>
            {yearClasses.map((schoolClass) => {
              const subjectIds = (data.data?.assignments ?? []).filter((assignment) => assignment.classId === schoolClass.id).map((assignment) => assignment.subjectId);
              const studentCount = data.data?.studentCounts[schoolClass.id];
              return (
                <li key={schoolClass.id} className='flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Link
                        href={`${ROUTES.teacher.classes}/${schoolClass.id}`}
                        className='text-lg font-semibold text-foreground underline-offset-3 hover:text-primary hover:underline'
                      >
                        {classLabel(schoolClass)}
                      </Link>
                      {schoolClass.classTeacherId === teacherId && <StatusBadge tone='brand'>Class teacher</StatusBadge>}
                    </div>
                    <div className='mt-1.5 flex flex-wrap gap-1.5'>
                      {subjectIds.map((subjectId) => (
                        <StatusBadge key={subjectId} tone='neutral'>
                          {subjectLabel(subjectById.get(subjectId))}
                        </StatusBadge>
                      ))}
                      {subjectIds.length === 0 && <span className='text-sm text-muted-foreground'>No subjects assigned</span>}
                    </div>
                    <p className='mt-1.5 text-sm text-muted-foreground'>
                      {studentCount === undefined || studentCount === null ? 'Students: —' : `${pluralize(studentCount, 'student')} enrolled`}
                      {schoolClass.roomNumber && <span className='font-mono'> · Room {schoolClass.roomNumber}</span>}
                    </p>
                  </div>
                  <div className='flex shrink-0 flex-wrap gap-2'>
                    <Button asChild variant='outline' size='sm'>
                      <Link href={`${ROUTES.teacher.classes}/${schoolClass.id}`}>
                        <UsersIcon aria-hidden />
                        Students
                      </Link>
                    </Button>
                    <Button asChild variant='outline' size='sm'>
                      <Link href={`${ROUTES.teacher.attendance}?classId=${schoolClass.id}`}>
                        <CalendarCheckIcon aria-hidden />
                        Attendance
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
