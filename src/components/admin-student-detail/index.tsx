'use client';

import { ArrowRightIcon, FileTextIcon, PencilIcon, PlusIcon, RefreshCwIcon, SchoolIcon, UserRoundXIcon } from 'lucide-react';
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
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { ProfileFields } from '@/components/profile-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { STUDENT_PROFILE_FORM_SCHEMA, type StudentProfileForm } from '@/constants/admin-student-detail';
import { BLOOD_GROUP_OPTIONS, GENDER_OPTIONS } from '@/constants/admin-students';
import { API_PATHS, MAX_PAGE_SIZE } from '@/constants/api-client';
import { ROUTES } from '@/constants/routes';
import { loadExamsForYears, loadStudent, updateStudent } from '@/functions/admin-student-detail';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { classLabel } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { PaginatedList } from '@/types/api';
import type { Enrollment } from '@/types/enrollments';
import type { SelectOption } from '@/types/reference-labels';
import type { Student } from '@/types/students';

/** THE OPTIONS, PLUS THE STORED VALUE WHEN IT IS NOT ONE OF THEM (E.G. ENTERED BEFORE THE LIST EXISTED), SO EDITING NEVER HIDES IT. */
function withStoredOption(options: readonly SelectOption[], storedValue: string | null): SelectOption[] {
  if (!storedValue || options.some((option) => option.value === storedValue)) return [...options];
  return [...options, { value: storedValue, label: storedValue }];
}

/** HOW A STORED BLOOD GROUP IS SHOWN: 'A-' → 'A−'. */
function bloodGroupLabel(value: string | null): string | null {
  if (!value) return null;
  return BLOOD_GROUP_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** ONE STUDENT: PROFILE (WITH EDIT), ACCOUNT ACCESS, ENROLLMENTS, AND REPORT CARDS PER EXAM. */
export function AdminStudentDetail() {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<StudentProfileForm | null>(null);

  const { id: studentId } = useParams<{ id: string }>();
  const { academicYearById, classById, isReady, errorMessage: referenceError } = useReferenceData();
  const record = useAsyncResult(`student|${studentId}`, loadRecord);
  const student = record.data;
  const enrollments = useApiQuery<PaginatedList<Enrollment>>(student ? API_PATHS.enrollments : null, { studentId, limit: MAX_PAGE_SIZE });
  // NEWEST YEAR FIRST; A STUDENT HAS AT MOST ONE ENROLLMENT PER YEAR.
  const enrollmentRows = [...(enrollments.data?.items ?? [])].sort((first, second) =>
    (academicYearById.get(second.academicYearId)?.startDate ?? '').localeCompare(academicYearById.get(first.academicYearId)?.startDate ?? ''),
  );
  const yearIds = [...new Set(enrollmentRows.map((enrollment) => enrollment.academicYearId))];
  const exams = useAsyncResult(yearIds.length > 0 ? `student-exams|${yearIds.join(',')}` : null, loadExams);

  const save = useMutation((values: StudentProfileForm) => updateStudent(studentId, values), {
    successMessage: (saved) => `Saved ${saved.user.fullName}.`,
    onSuccess: () => {
      setIsEditOpen(false);
      record.reload();
    },
  });

  const enrollHref = `${ROUTES.admin.enrollments}?studentId=${studentId}`;

  function loadRecord(signal: AbortSignal) {
    return loadStudent(studentId, signal);
  }

  function loadExams() {
    return loadExamsForYears(yearIds);
  }

  function examsOfYear(academicYearId: string) {
    return (exams.data ?? [])
      .filter((exam) => exam.academicYearId === academicYearId)
      .sort((first, second) => (first.startDate ?? '9999').localeCompare(second.startDate ?? '9999'));
  }

  function openEdit(current: Student) {
    setForm({
      fullName: current.user.fullName,
      phone: current.user.phone ?? '',
      admissionNumber: current.admissionNumber,
      admissionDate: current.admissionDate ?? '',
      dateOfBirth: current.dateOfBirth ?? '',
      gender: current.gender,
      bloodGroup: current.bloodGroup,
      fatherName: current.fatherName ?? '',
      motherName: current.motherName ?? '',
      address: current.address ?? '',
    });
    save.reset();
    setIsEditOpen(true);
  }

  function setField<K extends keyof StudentProfileForm>(field: K, value: StudentProfileForm[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function updateField(field: keyof StudentProfileForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      setField(field, event.target.value);
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = STUDENT_PROFILE_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  if (record.isInitialLoading) {
    return (
      <>
        <BackLink href={ROUTES.admin.students} label='Students' />
        <Skeleton className='mb-2 h-9 w-64' />
        <Skeleton className='mb-6 h-5 w-40' />
        <div className='grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
          <Skeleton className='h-80' />
          <Skeleton className='h-72' />
        </div>
      </>
    );
  }

  if (!student && record.errorMessage) {
    return (
      <>
        <BackLink href={ROUTES.admin.students} label='Students' />
        <FormAlert tone='error' title="Couldn't load this student">
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
        <BackLink href={ROUTES.admin.students} label='Students' />
        <div className='rounded-xl bg-card shadow-xs'>
          <EmptyState
            icon={UserRoundXIcon}
            title='Student not found'
            description='No student matches this link. It may be incomplete or out of date.'
            action={
              <Button asChild variant='outline'>
                <Link href={ROUTES.admin.students}>Back to students</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink href={ROUTES.admin.students} label='Students' />
      <PageHeader
        title={student.user.fullName}
        description={
          <span className='flex flex-wrap items-center gap-3'>
            <AccountStatusBadge isActive={student.user.isActive} graduatedOn={student.graduatedOn} />
            <span className='tabular-nums text-sm'>{student.admissionNumber}</span>
          </span>
        }
      />

      {referenceError && (
        <FormAlert tone='error' title="Some class and year names couldn't be loaded" className='mb-6'>
          {referenceError}
        </FormAlert>
      )}

      <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <div className='flex flex-col gap-6'>
          <Panel
            title='Profile'
            actions={
              <Button variant='outline' size='sm' onClick={() => openEdit(student)}>
                <PencilIcon aria-hidden />
                Edit
              </Button>
            }
          >
            <ProfileFields
              fields={[
                { label: 'Full name', value: student.user.fullName },
                { label: 'Admission number', value: student.admissionNumber, isMono: true },
                { label: 'Email', value: student.user.email, isMono: true },
                { label: 'Phone', value: student.user.phone, isMono: true },
                { label: 'Admission date', value: student.admissionDate ? formatDate(student.admissionDate) : null, isMono: true },
                { label: 'Date of birth', value: student.dateOfBirth ? formatDate(student.dateOfBirth) : null, isMono: true },
                ...(student.graduatedOn ? [{ label: 'Graduated on', value: formatDate(student.graduatedOn), isMono: true }] : []),
                { label: 'Gender', value: student.gender },
                { label: 'Blood group', value: bloodGroupLabel(student.bloodGroup) },
                { label: "Father's name", value: student.fatherName },
                { label: "Mother's name", value: student.motherName },
                { label: 'Address', value: student.address, isWide: true },
              ]}
            />
          </Panel>

          <Panel
            title='Enrollments'
            description='One class per academic year. Earlier years stay as history.'
            bodyClassName='p-0'
            actions={
              <Button asChild variant='outline' size='sm'>
                <Link href={enrollHref}>
                  <PlusIcon aria-hidden />
                  Enroll in a class
                </Link>
              </Button>
            }
          >
            {enrollments.errorMessage && (
              <div className='p-5'>
                <FormAlert tone='error' title="Couldn't load enrollments">
                  <span>{enrollments.errorMessage}</span>
                  <Button variant='outline' size='sm' className='mt-2 flex' onClick={enrollments.reload}>
                    <RefreshCwIcon aria-hidden />
                    Try again
                  </Button>
                </FormAlert>
              </div>
            )}
            {(enrollments.isInitialLoading || !isReady) && !enrollments.errorMessage && (
              <div className='flex flex-col gap-2 p-5'>
                <Skeleton className='h-5 w-full max-w-md' />
                <Skeleton className='h-5 w-full max-w-sm' />
              </div>
            )}
            {enrollments.data && isReady && enrollmentRows.length === 0 && (
              <EmptyState
                icon={SchoolIcon}
                title='Not enrolled in a class'
                description='Enroll this student in a class to add them to its attendance, exams and timetable.'
                action={
                  <Button asChild>
                    <Link href={enrollHref}>Enroll in a class</Link>
                  </Button>
                }
              />
            )}
            {enrollments.data && isReady && enrollmentRows.length > 0 && (
              <ul className='divide-y'>
                {enrollmentRows.map((enrollment) => (
                  <li key={enrollment.id} className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm'>
                    <div className='min-w-0'>
                      <span className='font-medium text-foreground'>{classLabel(classById.get(enrollment.classId))}</span>
                      <span className='ml-2 text-muted-foreground'>{academicYearById.get(enrollment.academicYearId)?.name ?? 'Unknown year'}</span>
                    </div>
                    <dl className='flex gap-5 text-muted-foreground'>
                      <div className='flex gap-1.5'>
                        <dt>Roll no.</dt>
                        <dd className='tabular-nums text-foreground'>{enrollment.rollNumber ?? '—'}</dd>
                      </div>
                      <div className='flex gap-1.5'>
                        <dt>Enrolled</dt>
                        <dd className='tabular-nums text-foreground'>{formatDate(enrollment.enrolledOn)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title='Report cards' description='One report card per exam in each year the student was enrolled.'>
            {exams.errorMessage && (
              <FormAlert tone='error' title="Couldn't load exams">
                <span>{exams.errorMessage}</span>
                <Button variant='outline' size='sm' className='mt-2 flex' onClick={exams.reload}>
                  <RefreshCwIcon aria-hidden />
                  Try again
                </Button>
              </FormAlert>
            )}
            {(!enrollments.data || !isReady || exams.isInitialLoading) && !exams.errorMessage && !enrollments.errorMessage && (
              <div className='flex flex-col gap-2'>
                <Skeleton className='h-5 w-full max-w-md' />
                <Skeleton className='h-5 w-full max-w-sm' />
              </div>
            )}
            {enrollments.errorMessage && <p className='text-sm text-muted-foreground'>Report cards appear once enrollments have loaded.</p>}
            {enrollments.data && isReady && enrollmentRows.length === 0 && (
              <EmptyState
                icon={FileTextIcon}
                title='No report cards yet'
                description='Report cards appear once the student is enrolled in a class and that year has exams.'
                className='py-6'
              />
            )}
            {exams.data && isReady && enrollmentRows.length > 0 && (
              <div className='flex flex-col gap-5'>
                {enrollmentRows.map((enrollment) => {
                  const yearExams = examsOfYear(enrollment.academicYearId);
                  return (
                    <section key={enrollment.id}>
                      <h3 className='text-sm font-medium text-foreground'>
                        {academicYearById.get(enrollment.academicYearId)?.name ?? 'Unknown year'}
                        <span className='ml-2 font-normal text-muted-foreground'>{classLabel(classById.get(enrollment.classId))}</span>
                      </h3>
                      {yearExams.length === 0 ? (
                        <p className='mt-1 text-sm text-muted-foreground'>No exams in this year yet.</p>
                      ) : (
                        <ul className='mt-2 divide-y divide-border/70 overflow-hidden rounded-xl bg-card shadow-xs'>
                          {yearExams.map((exam) => (
                            <li key={exam.id} className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm'>
                              <div className='min-w-0'>
                                <span className='font-medium text-foreground'>{exam.name}</span>
                                {exam.startDate && (
                                  <span className='ml-2 tabular-nums text-xs text-muted-foreground'>
                                    {formatDate(exam.startDate)}
                                    {exam.endDate && exam.endDate !== exam.startDate && ` – ${formatDate(exam.endDate)}`}
                                  </span>
                                )}
                              </div>
                              <Button asChild variant='ghost' size='sm'>
                                <Link href={`${ROUTES.admin.reportCards}?studentId=${student.id}&examId=${exam.id}`}>
                                  Report card
                                  <ArrowRightIcon aria-hidden />
                                </Link>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <AccountAccessPanel
          userId={student.userId}
          fullName={student.user.fullName}
          isActive={student.user.isActive}
          access={{ role: 'student', admissionNumber: student.admissionNumber }}
          onChanged={record.reload}
        />
      </div>

      <FormDialog
        isOpen={isEditOpen && form !== null}
        onOpenChange={setIsEditOpen}
        title={`Edit ${student.user.fullName}`}
        submitLabel='Save changes'
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
        size='lg'
      >
        {form && (
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField id='fullName' label='Full name' error={save.fieldErrors.fullName} isRequired>
              <Input {...fieldControlProps('fullName', save.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
            </FormField>
            <FormField id='admissionNumber' label='Admission number' error={save.fieldErrors.admissionNumber} isRequired>
              <Input
                {...fieldControlProps('admissionNumber', save.fieldErrors.admissionNumber)}
                value={form.admissionNumber}
                onChange={updateField('admissionNumber')}
                className='tabular-nums'
                autoComplete='off'
                spellCheck={false}
              />
            </FormField>
            <FormField id='email' label='Email' description="The email can't be changed.">
              <Input {...fieldControlProps('email', undefined, true)} value={student.user.email ?? ''} placeholder='Not recorded' className='tabular-nums' readOnly disabled />
            </FormField>
            <FormField id='phone' label='Phone' error={save.fieldErrors.phone}>
              <Input
                {...fieldControlProps('phone', save.fieldErrors.phone)}
                type='tel'
                value={form.phone}
                onChange={updateField('phone')}
                className='tabular-nums'
                autoComplete='off'
              />
            </FormField>
            <FormField id='admissionDate' label='Admission date' error={save.fieldErrors.admissionDate}>
              <Input
                {...fieldControlProps('admissionDate', save.fieldErrors.admissionDate)}
                type='date'
                value={form.admissionDate}
                onChange={updateField('admissionDate')}
                className='tabular-nums'
              />
            </FormField>
            <FormField id='dateOfBirth' label='Date of birth' error={save.fieldErrors.dateOfBirth}>
              <Input
                {...fieldControlProps('dateOfBirth', save.fieldErrors.dateOfBirth)}
                type='date'
                value={form.dateOfBirth}
                onChange={updateField('dateOfBirth')}
                className='tabular-nums'
              />
            </FormField>
            <FormField id='gender' label='Gender' error={save.fieldErrors.gender}>
              <OptionSelect
                {...fieldControlProps('gender', save.fieldErrors.gender)}
                value={form.gender}
                onValueChange={(value) => setField('gender', value)}
                options={withStoredOption(GENDER_OPTIONS, student.gender)}
                placeholder='Not specified'
                emptyLabel='Not specified'
              />
            </FormField>
            <FormField id='bloodGroup' label='Blood group' error={save.fieldErrors.bloodGroup}>
              <OptionSelect
                {...fieldControlProps('bloodGroup', save.fieldErrors.bloodGroup)}
                value={form.bloodGroup}
                onValueChange={(value) => setField('bloodGroup', value)}
                options={withStoredOption(BLOOD_GROUP_OPTIONS, student.bloodGroup)}
                placeholder='Not specified'
                emptyLabel='Not specified'
              />
            </FormField>
            <FormField id='fatherName' label="Father's name" error={save.fieldErrors.fatherName}>
              <Input {...fieldControlProps('fatherName', save.fieldErrors.fatherName)} value={form.fatherName} onChange={updateField('fatherName')} autoComplete='off' />
            </FormField>
            <FormField id='motherName' label="Mother's name" error={save.fieldErrors.motherName}>
              <Input {...fieldControlProps('motherName', save.fieldErrors.motherName)} value={form.motherName} onChange={updateField('motherName')} autoComplete='off' />
            </FormField>
            <FormField id='address' label='Address' error={save.fieldErrors.address} className='sm:col-span-2'>
              <Textarea {...fieldControlProps('address', save.fieldErrors.address)} value={form.address} onChange={updateField('address')} rows={3} />
            </FormField>
          </div>
        )}
      </FormDialog>
    </>
  );
}
