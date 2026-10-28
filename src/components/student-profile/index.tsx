'use client';

import { RefreshCwIcon, SchoolIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { ListSkeleton } from '@/components/list-skeleton';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { ProfileFields } from '@/components/profile-fields';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { PROFILE_CORRECTION_NOTE } from '@/constants/student-profile';
import { loadStudentProfile } from '@/functions/student-profile';
import { formatDate } from '@/helpers/format';
import { classLabel } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useReferenceData } from '@/hooks/use-reference-data';
import { portalSessionStore } from '@/zustand/portal-session';

/** THE STUDENT'S OWN DETAILS AND CLASS HISTORY, READ-ONLY. THE LOGIN EMAIL IS AN ACCOUNT DETAIL AND IS NOT SHOWN. */
export function StudentProfile() {
  const studentId = portalSessionStore((state) => state.recordId);

  const { academicYearById, classById, errorMessage: referenceError } = useReferenceData();

  function load(signal: AbortSignal) {
    return loadStudentProfile(studentId ?? '', signal);
  }

  const profile = useAsyncResult(studentId ? `student-profile|${studentId}` : null, load);

  const student = profile.data?.student;

  return (
    <>
      <PageHeader title='My profile' description={PROFILE_CORRECTION_NOTE} />

      {(profile.errorMessage || referenceError) && (
        <FormAlert tone='error' title="Your profile couldn't be loaded" className='mb-6'>
          <span>{profile.errorMessage ?? referenceError}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={profile.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <Panel title='Details'>
          {!student ? (
            <ListSkeleton rows={4} />
          ) : (
            <ProfileFields
              fields={[
                { label: 'Full name', value: student.user.fullName },
                { label: 'Admission number', value: student.admissionNumber, isMono: true },
                { label: 'Admission date', value: student.admissionDate ? formatDate(student.admissionDate) : null, isMono: true },
                { label: 'Date of birth', value: student.dateOfBirth ? formatDate(student.dateOfBirth) : null, isMono: true },
                { label: 'Gender', value: student.gender },
                { label: 'Blood group', value: student.bloodGroup?.replace('-', '−') },
                { label: "Father's name", value: student.fatherName },
                { label: "Mother's name", value: student.motherName },
                { label: 'Phone', value: student.user.phone, isMono: true },
                { label: 'Address', value: student.address, isWide: true },
              ]}
            />
          )}
        </Panel>

        <Panel title='Classes' description='Your class in each academic year.' bodyClassName='p-0 sm:p-0'>
          {!profile.data ? (
            <ListSkeleton rows={2} />
          ) : profile.data.enrollments.length === 0 ? (
            <EmptyState icon={SchoolIcon} title='Not in a class yet' description='The school office adds you to a class each year.' />
          ) : (
            <ul className='divide-y'>
              {profile.data.enrollments.map((enrollment) => {
                const year = academicYearById.get(enrollment.academicYearId);
                return (
                  <li key={enrollment.id} className='flex items-center justify-between gap-3 px-5 py-3'>
                    <span className='min-w-0'>
                      <span className='block font-medium text-foreground'>{classLabel(classById.get(enrollment.classId))}</span>
                      <span className='block text-sm text-muted-foreground'>
                        {year?.name ?? '—'}
                        {enrollment.rollNumber ? ` · Roll number ${enrollment.rollNumber}` : ''}
                      </span>
                    </span>
                    {year?.isCurrent && <StatusBadge tone='brand'>This year</StatusBadge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
