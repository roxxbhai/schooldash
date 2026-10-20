'use client';

import { KeyRoundIcon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { useState } from 'react';
import { AccountStatusBadge } from '@/components/account-status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Panel } from '@/components/panel';
import { SetupCodeDialog } from '@/components/setup-code-dialog';
import { Button } from '@/components/ui/button';
import { deactivateAccount, issueAccountSetupCode, reactivateAccount } from '@/functions/account-access-panel';
import { useMutation } from '@/hooks/use-mutation';
import type { IssuedSetupCode } from '@/types/account-setup';

interface AccountAccessPanelProps {
  /** `users.id`: THE RECORD'S `userId`. */
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  /** WHAT THE RECORDS ARE CALLED IN THE CONFIRMATION WORDING. */
  role: 'teacher' | 'student';
  /** CALLED AFTER THE ACCOUNT STATUS CHANGES, SO THE PAGE RELOADS THE RECORD. */
  onChanged: () => void;
}

/** HOW A TEACHER OR STUDENT SIGNS IN: THEIR LOGIN EMAIL, WHETHER THEY CAN, A NEW SETUP CODE, AND DEACTIVATE/REACTIVATE. */
export function AccountAccessPanel({ userId, fullName, email, isActive, role, onChanged }: AccountAccessPanelProps) {
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [isCodeConfirmOpen, setIsCodeConfirmOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<IssuedSetupCode | null>(null);

  const changeStatus = useMutation((targetUserId: string) => (isActive ? deactivateAccount(targetUserId) : reactivateAccount(targetUserId)), {
    successMessage: (change) => (change.isActive ? `${fullName} can sign in again.` : `${fullName} can no longer sign in.`),
    onSuccess: () => {
      setIsStatusConfirmOpen(false);
      onChanged();
    },
  });

  const issueCode = useMutation((targetUserId: string) => issueAccountSetupCode(targetUserId), {
    onSuccess: (code) => {
      setIsCodeConfirmOpen(false);
      setIssuedCode(code);
    },
  });

  const keptRecords = role === 'teacher' ? 'attendance, class and subject assignments' : 'enrollments, attendance and results';

  function openStatusConfirm() {
    changeStatus.reset();
    setIsStatusConfirmOpen(true);
  }

  function openCodeConfirm() {
    issueCode.reset();
    setIsCodeConfirmOpen(true);
  }

  return (
    <>
      <Panel title='Account access' description={`How ${fullName} signs in to the school portal.`}>
        <dl className='flex flex-col gap-4'>
          <div>
            <dt className='text-xs font-medium text-muted-foreground'>Login email</dt>
            <dd className='mt-0.5 font-mono text-sm break-all text-foreground'>{email}</dd>
            <dd className='mt-0.5 text-xs text-muted-foreground'>The login email can&apos;t be changed.</dd>
          </div>
          <div>
            <dt className='text-xs font-medium text-muted-foreground'>Status</dt>
            <dd className='mt-1'>
              <AccountStatusBadge isActive={isActive} />
            </dd>
            <dd className='mt-1.5 text-sm text-muted-foreground'>
              {isActive
                ? `${fullName} signs in with this email and the password they chose with their setup code. If they have lost the code or forgotten the password, issue a new code.`
                : `${fullName} can't sign in. Their ${keptRecords} are kept.`}
            </dd>
          </div>
        </dl>

        <div className='mt-5 flex flex-col gap-2 border-t pt-5'>
          <Button variant='outline' onClick={openCodeConfirm} disabled={!isActive} className='justify-start'>
            <KeyRoundIcon aria-hidden />
            Issue new setup code
          </Button>
          {!isActive && <p className='text-xs text-muted-foreground'>Reactivate the account to issue a setup code.</p>}
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
            : `${fullName} will be able to sign in again with their email and password.`
        }
        confirmLabel={isActive ? 'Deactivate account' : 'Reactivate account'}
        tone={isActive ? 'destructive' : 'default'}
        isPending={changeStatus.isPending}
        errorMessage={changeStatus.formError}
        onConfirm={() => void changeStatus.run(userId)}
      />

      <ConfirmDialog
        isOpen={isCodeConfirmOpen}
        onOpenChange={setIsCodeConfirmOpen}
        title={`Issue a new setup code for ${fullName}?`}
        description={
          <>
            <p>The new code replaces any earlier code, which stops working. It works once and expires after 7 days.</p>
            <p className='mt-2'>Use it when {fullName} hasn&apos;t set a password yet, or has forgotten it: the code lets them choose a new password.</p>
          </>
        }
        confirmLabel='Issue code'
        isPending={issueCode.isPending}
        errorMessage={issueCode.formError}
        onConfirm={() => void issueCode.run(userId)}
      />

      <SetupCodeDialog setupCode={issuedCode} personName={fullName} onClose={() => setIssuedCode(null)} />
    </>
  );
}
