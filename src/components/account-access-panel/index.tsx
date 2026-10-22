'use client';

import { RotateCcwKeyIcon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { useState } from 'react';
import { AccountStatusBadge } from '@/components/account-status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { deactivateAccount, reactivateAccount, resetTeacherSignUp } from '@/functions/account-access-panel';
import { formatPhone } from '@/helpers/phone';
import { useMutation } from '@/hooks/use-mutation';
import type { AccountAccess } from '@/types/account-access-panel';

interface AccountAccessPanelProps {
  /** `users.id`: THE RECORD'S `userId`. */
  userId: string;
  fullName: string;
  isActive: boolean;
  /** HOW THIS PERSON SIGNS IN. */
  access: AccountAccess;
  /** CALLED AFTER THE ACCOUNT CHANGES, SO THE PAGE RELOADS THE RECORD. */
  onChanged: () => void;
}

/**
 * HOW A TEACHER OR STUDENT SIGNS IN, AND DEACTIVATE/REACTIVATE.
 * TEACHERS: THEIR PHONE NUMBER, WHETHER THEY HAVE SIGNED UP, AND RESET SIGN-UP. STUDENTS: THEIR ADMISSION NUMBER.
 */
export function AccountAccessPanel({ userId, fullName, isActive, access, onChanged }: AccountAccessPanelProps) {
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const changeStatus = useMutation((targetUserId: string) => (isActive ? deactivateAccount(targetUserId) : reactivateAccount(targetUserId)), {
    successMessage: (change) => (change.isActive ? `${fullName} can sign in again.` : `${fullName} can no longer sign in.`),
    onSuccess: () => {
      setIsStatusConfirmOpen(false);
      onChanged();
    },
  });

  const resetSignUp = useMutation((targetUserId: string) => resetTeacherSignUp(targetUserId), {
    successMessage: () => `${fullName} can now sign up again with their phone number.`,
    onSuccess: () => {
      setIsResetConfirmOpen(false);
      onChanged();
    },
  });

  const isTeacher = access.role === 'teacher';
  const keptRecords = isTeacher ? 'attendance, class and subject assignments' : 'enrollments, attendance and results';
  const howTheySignIn = isTeacher
    ? access.isSignedUp
      ? `${fullName} signs in on the teacher sign-in page with this number and the password they chose. If they have forgotten it, reset their sign-up.`
      : `${fullName} hasn't signed up yet. They open the teacher sign-up page (${ROUTES.teacherSignUp}), enter this number and choose a password.`
    : `${fullName} signs in on the student sign-in page (${ROUTES.studentSignIn}) with this admission number. No password is needed.`;

  function openStatusConfirm() {
    changeStatus.reset();
    setIsStatusConfirmOpen(true);
  }

  function openResetConfirm() {
    resetSignUp.reset();
    setIsResetConfirmOpen(true);
  }

  return (
    <>
      <Panel title='Account access' description={`How ${fullName} signs in to the school portal.`}>
        <dl className='flex flex-col gap-4'>
          <div>
            <dt className='text-xs font-medium text-muted-foreground'>{isTeacher ? 'Sign-in mobile number' : 'Admission number'}</dt>
            <dd className='mt-0.5 tabular-nums text-sm break-all text-foreground'>{isTeacher ? formatPhone(access.phone) : access.admissionNumber}</dd>
            {isTeacher && !access.phone && <dd className='mt-0.5 text-xs text-destructive'>Add a mobile number to their profile so they can sign in.</dd>}
          </div>
          <div>
            <dt className='text-xs font-medium text-muted-foreground'>Status</dt>
            <dd className='mt-1 flex flex-wrap gap-1.5'>
              <AccountStatusBadge isActive={isActive} />
              {isTeacher && <StatusBadge tone={access.isSignedUp ? 'success' : 'warning'}>{access.isSignedUp ? 'Signed up' : 'Not signed up yet'}</StatusBadge>}
            </dd>
            <dd className='mt-1.5 text-sm text-muted-foreground'>{isActive ? howTheySignIn : `${fullName} can't sign in. Their ${keptRecords} are kept.`}</dd>
          </div>
        </dl>

        <div className='mt-5 flex flex-col gap-2 border-t pt-5'>
          {isTeacher && (
            <>
              <Button variant='outline' onClick={openResetConfirm} disabled={!isActive || !access.isSignedUp} className='justify-start'>
                <RotateCcwKeyIcon aria-hidden />
                Reset sign-up
              </Button>
              {!isActive && <p className='text-xs text-muted-foreground'>Reactivate the account to reset their sign-up.</p>}
            </>
          )}
          {isActive ? (
            <Button variant='destructive' onClick={openStatusConfirm} className='justify-start'>
              <UserXIcon aria-hidden />
              Deactivate account
            </Button>
          ) : (
            <Button variant='outline' onClick={openStatusConfirm} className='justify-start'>
              <UserCheckIcon aria-hidden />
              Reactivate account
            </Button>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        isOpen={isStatusConfirmOpen}
        onOpenChange={setIsStatusConfirmOpen}
        title={isActive ? `Deactivate ${fullName}?` : `Reactivate ${fullName}?`}
        description={
          isActive
            ? `${fullName} will be signed out everywhere straight away and won't be able to sign in. Their ${keptRecords} are kept, and you can reactivate the account later.`
            : `${fullName} will be able to sign in again.`
        }
        confirmLabel={isActive ? 'Deactivate account' : 'Reactivate account'}
        tone={isActive ? 'destructive' : 'default'}
        isPending={changeStatus.isPending}
        errorMessage={changeStatus.formError}
        onConfirm={() => void changeStatus.run(userId)}
      />

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onOpenChange={setIsResetConfirmOpen}
        title={`Reset ${fullName}'s sign-up?`}
        description={
          <>
            <p>Their current password stops working and they are signed out everywhere.</p>
            <p className='mt-2'>
              They then sign up again on the teacher sign-up page with their mobile number and choose a new password. Use this when they have forgotten
              their password.
            </p>
          </>
        }
        confirmLabel='Reset sign-up'
        tone='destructive'
        isPending={resetSignUp.isPending}
        errorMessage={resetSignUp.formError}
        onConfirm={() => void resetSignUp.run(userId)}
      />
    </>
  );
}
