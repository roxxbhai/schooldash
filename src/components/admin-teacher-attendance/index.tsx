'use client';

import { UserCheckIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { AttendanceRegister } from '@/components/attendance-register';
import { AttendanceToolbar } from '@/components/attendance-toolbar';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ATTENDANCE_SAVE_CONCURRENCY } from '@/constants/admin-attendance';
import { createTeacherAttendance, loadTeacherAttendance, updateTeacherAttendance } from '@/functions/admin-teacher-attendance';
import { refreshReferenceData } from '@/functions/reference-data';
import {
  announceAttendanceSave,
  correctedRows,
  correctionBody,
  countAttendance,
  failureMessage,
  isSelectableDate,
  listNames,
  newlyMarkedRows,
  remarksForCreate,
  runWithConcurrency,
} from '@/helpers/admin-attendance';
import { teacherRegisterRows } from '@/helpers/admin-teacher-attendance';
import { formatDate, pluralize, todayInSchool } from '@/helpers/format';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useAttendanceSession } from '@/hooks/use-attendance-session';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { TeacherRegisterData } from '@/types/admin-teacher-attendance';
import type { TeacherAttendance } from '@/types/teacher-attendance';

/**
 * THE DAILY STAFF REGISTER: EVERY ACTIVE TEACHER FOR ONE DATE. THERE IS NO BULK
 * ENDPOINT, SO EACH NEW RECORD IS POSTED AND EACH CORRECTION PATCHED, A FEW AT A TIME.
 */
export function AdminTeacherAttendance() {
  const [attendanceDate, setAttendanceDate] = useState(() => todayInSchool());
  const [isSaving, setIsSaving] = useState(false);

  const isSavingRef = useRef(false);
  const { teachers, isReady, errorMessage: referenceError } = useReferenceData();

  const today = todayInSchool();
  const isDateValid = isSelectableDate(attendanceDate, today);
  const registerKey = isDateValid ? attendanceDate : null;

  const register = useAsyncResult<TeacherRegisterData>(registerKey, loadRegister);
  const attendance = useAttendanceSession<TeacherAttendance>(registerKey);

  // AN ANSWER FOR ANOTHER DATE (STILL VISIBLE WHILE THE NEXT LOADS) IS NEVER SHOWN AS THIS REGISTER.
  const data = isReady && register.data?.attendanceDate === attendanceDate ? register.data : null;
  const rows = data ? teacherRegisterRows(teachers, data, attendance.session) : null;
  const counts = countAttendance(rows ?? []);
  const toCreate = newlyMarkedRows(rows ?? []);
  const toCorrect = correctedRows(rows ?? []);
  const pendingCount = toCreate.length + toCorrect.length;
  const isEditingDisabled = isSaving || register.isLoading || !data;

  function loadRegister() {
    return loadTeacherAttendance(attendanceDate);
  }

  async function handleSave() {
    if (isSavingRef.current || !registerKey || pendingCount === 0 || isEditingDisabled) return;
    isSavingRef.current = true;
    setIsSaving(true);

    const pending = [...toCreate, ...toCorrect];
    const results = await runWithConcurrency(pending, ATTENDANCE_SAVE_CONCURRENCY, (row) =>
      row.record
        ? updateTeacherAttendance(row.record.id, correctionBody(row.record, row.draft))
        : createTeacherAttendance({ teacherId: row.id, attendanceDate, status: row.draft.status, ...remarksForCreate(row.draft) }),
    );

    const saved: Record<string, TeacherAttendance> = {};
    const errors: Record<string, string> = {};
    const failedNames: string[] = [];
    results.forEach((result, index) => {
      const row = pending[index];
      if (result.success) {
        saved[row.id] = result.data;
        return;
      }
      errors[row.id] = failureMessage(result);
      failedNames.push(row.name);
    });
    const createdCount = toCreate.filter((row) => saved[row.id]).length;
    const correctedCount = toCorrect.filter((row) => saved[row.id]).length;

    attendance.applySaveOutcome(registerKey, {
      saved,
      errors,
      formError: failedNames.length > 0 ? `Attendance for ${listNames(failedNames)} couldn't be saved. The reason is shown on each row.` : null,
    });
    announceAttendanceSave({ created: createdCount, corrected: correctedCount, failed: failedNames.length }, 'teacher');
    register.reload();
    isSavingRef.current = false;
    setIsSaving(false);
  }

  return (
    <>
      <PageHeader
        title='Teacher attendance'
        description='Mark the daily register for teaching staff. Teachers you leave unmarked are simply not recorded for the day; they are not counted as absent.'
      />

      {referenceError && (
        <FormAlert tone='error' title="Couldn't load teachers" className='mb-4'>
          <span>{referenceError}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={() => void refreshReferenceData()}>
            Try again
          </Button>
        </FormAlert>
      )}

      <div className='mb-4 w-full sm:w-64'>
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

      {isDateValid && (
        <>
          <div className='mb-3 flex flex-wrap items-baseline justify-between gap-2'>
            <h2 className='font-mono text-xl font-semibold tracking-tight text-foreground'>{formatDate(attendanceDate)}</h2>
            {rows && <p className='text-sm text-muted-foreground'>{pluralize(rows.length, 'teacher')}</p>}
          </div>

          {attendance.session.formError && (
            <FormAlert tone='error' title='Some attendance was not saved' className='mb-3'>
              {attendance.session.formError}
            </FormAlert>
          )}

          <AttendanceRegister
            label='Teacher attendance register'
            nameHeader='Teacher'
            rows={rows}
            isLoading={register.isLoading || (rows === null && !register.errorMessage && !referenceError)}
            isDisabled={isEditingDisabled}
            errorMessage={register.isLoading ? null : register.errorMessage}
            onRetry={register.reload}
            empty={<EmptyState icon={UserCheckIcon} title='No active teachers' description='Add teachers from the Teachers page, then come back to take attendance.' />}
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
