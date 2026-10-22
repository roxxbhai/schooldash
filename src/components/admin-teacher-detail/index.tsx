'use client';

import { ArrowRightIcon, PencilIcon, RefreshCwIcon, UserRoundXIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AccountAccessPanel } from '@/components/account-access-panel';
import { AccountStatusBadge } from '@/components/account-status-badge';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { ProfileFields } from '@/components/profile-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TEACHER_PROFILE_FORM_SCHEMA, type TeacherProfileForm } from '@/constants/admin-teacher-detail';
import { API_PATHS, MAX_PAGE_SIZE } from '@/constants/api-client';
import { ROUTES } from '@/constants/routes';
import { loadTeacher, updateTeacher } from '@/functions/admin-teacher-detail';
import { refreshReferenceData } from '@/functions/reference-data';
import { formatDate, pluralize } from '@/helpers/format';
import { formatPhone } from '@/helpers/phone';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { classLabel, sortClasses, subjectLabel } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { TeacherAssignment } from '@/types/teacher-assignments';
import type { Teacher } from '@/types/teachers';

/** ONE TEACHER: PROFILE (WITH EDIT), ACCOUNT ACCESS, AND WHAT THEY TEACH. */
export function AdminTeacherDetail() {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<TeacherProfileForm | null>(null);

  const { id: teacherId } = useParams<{ id: string }>();
  const { classes, academicYearById, classById, subjectById, isReady, errorMessage: referenceError } = useReferenceData();
  const record = useAsyncResult(`teacher|${teacherId}`, loadRecord);
  const teacher = record.data;
  const assignments = useApiQuery<PaginatedList<TeacherAssignment>>(teacher ? API_PATHS.teacherAssignments : null, {
    teacherId,
    limit: MAX_PAGE_SIZE,
  });

  const save = useMutation((values: TeacherProfileForm) => updateTeacher(teacherId, values), {
    successMessage: (saved) => `Saved ${saved.user.fullName}.`,
    onSuccess: () => {
      setIsEditOpen(false);
      record.reload();
      void refreshReferenceData();
    },
  });

  const classTeacherOf = teacher ? sortClasses(classes.filter((schoolClass) => schoolClass.classTeacherId === teacher.id)) : [];
  const assignmentRows = assignments.data?.items ?? [];

  function loadRecord(signal: AbortSignal) {
    return loadTeacher(teacherId, signal);
  }

  function yearNameOfClass(classId: string) {
    const schoolClass = classById.get(classId);
    return schoolClass ? (academicYearById.get(schoolClass.academicYearId)?.name ?? '') : '';
  }

  function openEdit(current: Teacher) {
    setForm({
      fullName: current.user.fullName,
      phone: current.user.phone ?? '',
      qualification: current.qualification ?? '',
      dateOfJoining: current.dateOfJoining ?? '',
    });
    save.reset();
    setIsEditOpen(true);
  }

  function updateField(field: keyof TeacherProfileForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setForm((current) => (current ? { ...current, [field]: event.target.value } : current));
      save.setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = TEACHER_PROFILE_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  if (record.isInitialLoading) {
    return (
      <>
        <BackLink href={ROUTES.admin.teachers} label='Teachers' />
        <Skeleton className='mb-2 h-9 w-64' />
        <Skeleton className='mb-6 h-5 w-40' />
        <div className='grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
          <Skeleton className='h-72' />
          <Skeleton className='h-72' />
        </div>
      </>
    );
  }

  if (!teacher && record.errorMessage) {
    return (
      <>
        <BackLink href={ROUTES.admin.teachers} label='Teachers' />
        <FormAlert tone='error' title="Couldn't load this teacher">
          <span>{record.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={record.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      </>
    );
  }

  if (!teacher) {
    return (
      <>
        <BackLink href={ROUTES.admin.teachers} label='Teachers' />
        <div className='border bg-card shadow-xs'>
          <EmptyState
            icon={UserRoundXIcon}
            title='Teacher not found'
            description='No teacher matches this link. It may be incomplete or out of date.'
            action={
              <Button asChild variant='outline'>
                <Link href={ROUTES.admin.teachers}>Back to teachers</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink href={ROUTES.admin.teachers} label='Teachers' />
      <PageHeader
        title={teacher.user.fullName}
        description={
          <span className='flex flex-wrap items-center gap-3'>
            <AccountStatusBadge isActive={teacher.user.isActive} />
            <span className='tabular-nums text-sm'>{teacher.employeeCode}</span>
          </span>
        }
      />

      <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <div className='flex flex-col gap-6'>
          <Panel
            title='Profile'
            actions={
              <Button variant='outline' size='sm' onClick={() => openEdit(teacher)}>
                <PencilIcon aria-hidden />
                Edit
              </Button>
            }
          >
            <ProfileFields
              fields={[
                { label: 'Full name', value: teacher.user.fullName },
                { label: 'Employee code', value: teacher.employeeCode, isMono: true },
                { label: 'Email', value: teacher.user.email, isMono: true },
                { label: 'Mobile number', value: formatPhone(teacher.user.phone), isMono: true },
                { label: 'Qualification', value: teacher.qualification },
                { label: 'Date of joining', value: teacher.dateOfJoining ? formatDate(teacher.dateOfJoining) : null, isMono: true },
              ]}
            />
          </Panel>

          <Panel
            title='Teaching'
            description='Classes they look after, and the subjects they teach.'
            actions={
              <Button asChild variant='outline' size='sm'>
                <Link href={ROUTES.admin.teacherAssignments}>
                  Manage assignments
                  <ArrowRightIcon aria-hidden />
                </Link>
              </Button>
            }
          >
            {referenceError && (
              <FormAlert tone='error' title="Some names couldn't be loaded" className='mb-4'>
                {referenceError}
              </FormAlert>
            )}

            <h3 className='text-sm font-medium text-foreground'>Class teacher of</h3>
            {!isReady && <Skeleton className='mt-2 h-5 w-48' />}
            {isReady && classTeacherOf.length === 0 && <p className='mt-1 text-sm text-muted-foreground'>Not the class teacher of any class.</p>}
            {isReady && classTeacherOf.length > 0 && (
              <ul className='mt-2 flex flex-wrap gap-2'>
                {classTeacherOf.map((schoolClass) => (
                  <li key={schoolClass.id} className='border bg-surface-muted px-2.5 py-1 text-sm'>
                    <span className='font-medium text-foreground'>{classLabel(schoolClass)}</span>
                    <span className='ml-2 text-muted-foreground'>{academicYearById.get(schoolClass.academicYearId)?.name}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className='mt-6 text-sm font-medium text-foreground'>Subjects taught</h3>
            {assignments.errorMessage && (
              <FormAlert tone='error' title="Couldn't load assignments" className='mt-2'>
                <span>{assignments.errorMessage}</span>
                <Button variant='outline' size='sm' className='mt-2 flex' onClick={assignments.reload}>
                  <RefreshCwIcon aria-hidden />
                  Try again
                </Button>
              </FormAlert>
            )}
            {(assignments.isInitialLoading || !isReady) && !assignments.errorMessage && (
              <div className='mt-2 flex flex-col gap-2'>
                <Skeleton className='h-5 w-64' />
                <Skeleton className='h-5 w-56' />
              </div>
            )}
            {assignments.data && isReady && assignmentRows.length === 0 && (
              <p className='mt-1 text-sm text-muted-foreground'>
                No subjects assigned yet.{' '}
                <Link href={ROUTES.admin.teacherAssignments} className='font-medium text-primary underline underline-offset-3'>
                  Assign a subject
                </Link>
              </p>
            )}
            {assignments.data && isReady && assignmentRows.length > 0 && (
              <>
                <ul className='mt-2 divide-y border'>
                  {assignmentRows.map((assignment) => (
                    <li key={assignment.id} className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2.5 text-sm'>
                      <span className='font-medium text-foreground'>{subjectLabel(subjectById.get(assignment.subjectId))}</span>
                      <span className='text-muted-foreground'>
                        {classLabel(classById.get(assignment.classId))}
                        {yearNameOfClass(assignment.classId) && ` · ${yearNameOfClass(assignment.classId)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {assignments.data.pagination.total > assignmentRows.length && (
                  <p className='mt-2 text-xs text-muted-foreground'>
                    Showing {assignmentRows.length} of {pluralize(assignments.data.pagination.total, 'assignment')}.
                  </p>
                )}
              </>
            )}
          </Panel>
        </div>

        <AccountAccessPanel
          userId={teacher.userId}
          fullName={teacher.user.fullName}
          isActive={teacher.user.isActive}
          access={{ role: 'teacher', phone: teacher.user.phone, isSignedUp: teacher.user.passwordSetAt !== null }}
          onChanged={() => {
            record.reload();
            void refreshReferenceData();
          }}
        />
      </div>

      <FormDialog
        isOpen={isEditOpen && form !== null}
        onOpenChange={setIsEditOpen}
        title={`Edit ${teacher.user.fullName}`}
        submitLabel='Save changes'
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        {form && (
          <>
            <FormField id='fullName' label='Full name' error={save.fieldErrors.fullName} isRequired>
              <Input {...fieldControlProps('fullName', save.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
            </FormField>
            <FormField id='email' label='Email' description="The login email can't be changed.">
              <Input {...fieldControlProps('email', undefined, true)} value={teacher.user.email} className='tabular-nums' readOnly disabled />
            </FormField>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField id='employeeCode' label='Employee code' description='Assigned automatically. It cannot be changed.'>
                <Input {...fieldControlProps('employeeCode', undefined, true)} value={teacher.employeeCode} className='tabular-nums' readOnly disabled />
              </FormField>
              <FormField id='phone' label='Mobile number' description='They sign in with this number.' error={save.fieldErrors.phone} isRequired>
                <Input
                  {...fieldControlProps('phone', save.fieldErrors.phone, true)}
                  type='tel'
                  inputMode='tel'
                  placeholder='98765 43210'
                  value={form.phone}
                  onChange={updateField('phone')}
                  className='tabular-nums'
                  autoComplete='off'
                />
              </FormField>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField id='qualification' label='Qualification' description='Optional.' error={save.fieldErrors.qualification}>
                <Input
                  {...fieldControlProps('qualification', save.fieldErrors.qualification, true)}
                  value={form.qualification}
                  onChange={updateField('qualification')}
                  autoComplete='off'
                />
              </FormField>
              <FormField id='dateOfJoining' label='Date of joining' description='Optional.' error={save.fieldErrors.dateOfJoining}>
                <Input
                  {...fieldControlProps('dateOfJoining', save.fieldErrors.dateOfJoining, true)}
                  type='date'
                  value={form.dateOfJoining}
                  onChange={updateField('dateOfJoining')}
                  className='tabular-nums'
                />
              </FormField>
            </div>
          </>
        )}
      </FormDialog>
    </>
  );
}
