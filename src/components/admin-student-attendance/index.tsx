'use client';

import { CalendarCheckIcon, SchoolIcon, UsersIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { AttendanceRegister } from '@/components/attendance-register';
import { AttendanceToolbar } from '@/components/attendance-toolbar';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ATTENDANCE_SAVE_CONCURRENCY, STUDENT_REGISTER_PORTAL_COPY } from '@/constants/admin-attendance';
import { MAX_BULK_ATTENDANCE_RECORDS } from '@/constants/student-attendance';
import { createStudentAttendanceBulk, loadStudentRegister, updateStudentAttendance } from '@/functions/admin-student-attendance';
import { refreshReferenceData } from '@/functions/reference-data';
import {
  announceAttendanceSave,
  chunk,
  correctedRows,
  correctionBody,
  countAttendance,
  failureMessage,
  isSelectableDate,
  listNames,
  newlyMarkedRows,
  remarksForCreate,
  runWithConcurrency,
  splitBulkIssues,
} from '@/helpers/admin-attendance';
import { studentRegisterRows } from '@/helpers/admin-student-attendance';
import { formatDate, pluralize, todayInSchool } from '@/helpers/format';
import { academicYearOptions, classLabel, classOptions } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useAttendanceSession } from '@/hooks/use-attendance-session';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { StudentRegisterData } from '@/types/admin-student-attendance';
import type { StudentAttendance } from '@/types/student-attendance';

/**
 * THE DAILY STUDENT REGISTER FOR ONE CLASS: MARK, CORRECT AND SAVE. NEW RECORDS GO IN
 * ONE ALL-OR-NOTHING BULK REQUEST; CORRECTIONS ARE PATCHED ONE BY ONE. UNMARKED
 * STUDENTS ARE SIMPLY NOT RECORDED. SHARED BY THE ADMIN AND TEACHER PORTALS: A
 * TEACHER'S CLASS LIST IS ALREADY ONLY THE CLASSES THEY TEACH (RLS), AND THE API
 * REFUSES ANY OTHER. `?classId=` OPENS A CLASS DIRECTLY (E.G. FROM A ROSTER).
 */
export function AdminStudentAttendance({ role = 'ADMIN' }: { role?: 'ADMIN' | 'TEACHER' } = {}) {
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [classChoice, setClassChoice] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => todayInSchool());
  const [isSaving, setIsSaving] = useState(false);

  const isSavingRef = useRef(false);
  const searchParams = useSearchParams();
  const { academicYears, classes, academicYearById, classById, currentAcademicYear, isReady, errorMessage: referenceError } = useReferenceData();

  const copy = STUDENT_REGISTER_PORTAL_COPY[role];
  const today = todayInSchool();
  const linkedClass = classById.get(searchParams.get('classId') ?? '');
  const selectedYearId = yearChoice ?? linkedClass?.academicYearId ?? currentAcademicYear?.id ?? null;
  const yearClassOptions = classOptions(classes, selectedYearId);
  const effectiveClassChoice = classChoice ?? (yearChoice === null ? (linkedClass?.id ?? null) : null);
  const selectedClass = effectiveClassChoice ? classById.get(effectiveClassChoice) : undefined;
  const classId = selectedClass && selectedClass.academicYearId === selectedYearId ? selectedClass.id : null;
  const classYear = selectedClass ? academicYearById.get(selectedClass.academicYearId) : undefined;
  const isDateValid = isSelectableDate(attendanceDate, today);
  const isOutsideYear = Boolean(classYear && isDateValid && (attendanceDate < classYear.startDate || attendanceDate > classYear.endDate));
  const registerKey = classId && isDateValid ? `${classId}|${attendanceDate}` : null;

  const register = useAsyncResult<StudentRegisterData>(registerKey, loadRegister);
  const attendance = useAttendanceSession<StudentAttendance>(registerKey);

  // AN ANSWER FOR ANOTHER CLASS OR DATE (STILL VISIBLE WHILE THE NEXT LOADS) IS NEVER SHOWN AS THIS REGISTER.
  const data = register.data?.classId === classId && register.data?.attendanceDate === attendanceDate ? register.data : null;
  const rows = data ? studentRegisterRows(data, attendance.session) : null;
  const counts = countAttendance(rows ?? []);
  const toCreate = newlyMarkedRows(rows ?? []);
  const toCorrect = correctedRows(rows ?? []);
  const pendingCount = toCreate.length + toCorrect.length;
  const isEditingDisabled = isSaving || register.isLoading || isOutsideYear || !data;

  function loadRegister() {
    return loadStudentRegister(classId ?? '', attendanceDate);
  }

  function handleYearChange(value: string | null) {
    setYearChoice(value);
    setClassChoice(null);
  }

  async function handleSave() {
    if (isSavingRef.current || !classId || !registerKey || pendingCount === 0 || isEditingDisabled) return;
    isSavingRef.current = true;
    setIsSaving(true);

    const saved: Record<string, StudentAttendance> = {};
    const errors: Record<string, string> = {};
    const messages: string[] = [];
    let createdCount = 0;
    let failedCount = 0;

    // NEW RECORDS: ONE BULK REQUEST (SPLIT ONLY ABOVE THE API'S 200-RECORD LIMIT). ANY INVALID RECORD REJECTS ITS WHOLE BATCH.
    for (const batch of chunk(toCreate, MAX_BULK_ATTENDANCE_RECORDS)) {
      const result = await createStudentAttendanceBulk({
        classId,
        attendanceDate,
        records: batch.map((row) => ({ studentId: row.id, status: row.draft.status, ...remarksForCreate(row.draft) })),
      });
      if (result.success) {
        for (const item of result.data.items) saved[item.studentId] = item;
        createdCount += result.data.count;
        continue;
      }
      failedCount += batch.length;
      const { byIndex, general } = splitBulkIssues(result.data.details);
      byIndex.forEach((message, index) => {
        const row = batch[index];
        if (row) errors[row.id] = message;
      });
      const reason = general.length > 0 ? general.join(' ') : result.message;
      messages.push(`${reason} None of the ${pluralize(batch.length, 'new record')} were saved, because one invalid record stops the whole submission.`);
    }

    // CORRECTIONS: ONE PATCH PER CHANGED RECORD, A FEW AT A TIME.
    const corrections = await runWithConcurrency(toCorrect, ATTENDANCE_SAVE_CONCURRENCY, (row) =>
      updateStudentAttendance(row.record.id, correctionBody(row.record, row.draft)),
    );
    const failedCorrections: string[] = [];
    corrections.forEach((result, index) => {
      const row = toCorrect[index];
      if (result.success) {
        saved[row.id] = result.data;
        return;
      }
      errors[row.id] = failureMessage(result);
      failedCorrections.push(row.name);
    });
    if (failedCorrections.length > 0) {
      failedCount += failedCorrections.length;
      messages.push(`Corrections for ${listNames(failedCorrections)} couldn't be saved.`);
    }

    attendance.applySaveOutcome(registerKey, { saved, errors, formError: messages.length > 0 ? messages.join(' ') : null });
    announceAttendanceSave({ created: createdCount, corrected: toCorrect.length - failedCorrections.length, failed: failedCount }, 'student');
    register.reload();
    isSavingRef.current = false;
    setIsSaving(false);
  }

  function renderEmpty() {
    // WHILE THE YEARS AND CLASSES LOAD, SHOW NOTHING RATHER THAN A MISLEADING "CREATE A YEAR FIRST".
    if (!isReady) return <Skeleton className='h-40 w-full' />;
    if (academicYears.length === 0) {
      return <EmptyState icon={SchoolIcon} title={copy.noYearTitle} description={copy.noYear} />;
    }
    if (yearClassOptions.length === 0) {
      return <EmptyState icon={SchoolIcon} title='No classes in this year' description={copy.noClasses} />;
    }
    return <EmptyState icon={CalendarCheckIcon} title='Choose a class' description='Pick a class and a date to open its register.' />;
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        description='Mark the daily register for a class. Students you leave unmarked are simply not recorded for the day; they are not counted as absent.'
      />

      {referenceError && (
        <FormAlert tone='error' title="Couldn't load classes" className='mb-4'>
          <span>{referenceError}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={() => void refreshReferenceData()}>
            Try again
          </Button>
        </FormAlert>
      )}

      <div className='mb-4 grid gap-4 sm:grid-cols-3 lg:max-w-3xl'>
        <FormField id='attendance-year' label='Academic year'>
          <OptionSelect
            id='attendance-year'
            value={selectedYearId}
            onValueChange={handleYearChange}
            options={academicYearOptions(academicYears)}
            placeholder='Academic year'
            isDisabled={!isReady || isSaving}
          />
        </FormField>
        <FormField id='attendance-class' label='Class'>
          <OptionSelect
            id='attendance-class'
            value={classId}
            onValueChange={setClassChoice}
            options={yearClassOptions}
            placeholder='Choose a class'
            isDisabled={!isReady || isSaving || yearClassOptions.length === 0}
          />
        </FormField>
        <FormField
          id='attendance-date'
          label='Date'
          error={isDateValid ? undefined : 'Choose a date up to today.'}
          description={attendanceDate === today ? 'Today' : formatDate(attendanceDate)}
        >
          <Input
            id='attendance-date'
            type='date'
            value={attendanceDate}
            max={today}
            onChange={(event) => setAttendanceDate(event.target.value)}
            disabled={isSaving}
            aria-invalid={isDateValid ? undefined : true}
            aria-describedby={isDateValid ? 'attendance-date-description' : 'attendance-date-error'}
            className='font-mono'
          />
        </FormField>
      </div>

      {!classId && <div className='border bg-card shadow-xs'>{renderEmpty()}</div>}

      {classId && (
        <>
          <div className='mb-3 flex flex-wrap items-baseline justify-between gap-2'>
            <h2 className='text-xl font-semibold tracking-tight text-foreground'>
              {classLabel(selectedClass)}
              <span className='ml-2 font-mono text-base font-normal text-muted-foreground'>{formatDate(attendanceDate)}</span>
            </h2>
            {rows && <p className='text-sm text-muted-foreground'>{pluralize(rows.length, 'student')} enrolled</p>}
          </div>

          {isOutsideYear && classYear && (
            <FormAlert tone='info' title='Outside this academic year' className='mb-3'>
              {`${classYear.name} runs from ${formatDate(classYear.startDate)} to ${formatDate(classYear.endDate)}. Choose a date in that range to record attendance.`}
            </FormAlert>
          )}

          {attendance.session.formError && (
            <FormAlert tone='error' title='Some attendance was not saved' className='mb-3'>
              {attendance.session.formError}
            </FormAlert>
          )}

          <AttendanceRegister
            label={`Attendance register for ${classLabel(selectedClass)}`}
            leadingHeader='Roll'
            nameHeader='Student'
            rows={rows}
            isLoading={register.isLoading || (rows === null && !register.errorMessage)}
            isDisabled={isEditingDisabled}
            errorMessage={register.isLoading ? null : register.errorMessage}
            onRetry={register.reload}
            empty={<EmptyState icon={UsersIcon} title='No students enrolled' description={copy.noStudents} />}
            onStatusChange={attendance.setStatus}
            onRemarksChange={attendance.setRemarks}
          />

          {rows && rows.length > 0 && (
            <AttendanceToolbar
              counts={counts}
              pendingCount={pendingCount}
              isSaving={isSaving}
              isDisabled={isEditingDisabled}
              onMarkRemainingPresent={() => attendance.markRemainingPresent(rows)}
              onReset={attendance.reset}
              onSave={() => void handleSave()}
            />
          )}
        </>
      )}
    </>
  );
}
