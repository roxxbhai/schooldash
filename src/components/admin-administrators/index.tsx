'use client';

import { KeyRoundIcon, PlusIcon, ShieldCheckIcon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { useState } from 'react';
import { AccountStatusBadge } from '@/components/account-status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { PaginationBar } from '@/components/pagination-bar';
import { SetupCodeDialog } from '@/components/setup-code-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ADMINISTRATOR_FORM_SCHEMA, EMPTY_ADMINISTRATOR_FORM, type AdministratorForm } from '@/constants/admin-administrators';
import { API_PATHS } from '@/constants/api-client';
import { deactivateAccount, reactivateAccount } from '@/functions/account-access-panel';
import { createAdministrator, issueAdministratorSetupCode } from '@/functions/admin-administrators';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { useApiQuery } from '@/hooks/use-api-query';
import { useMutation } from '@/hooks/use-mutation';
import type { IssuedSetupCode } from '@/types/account-setup';
import type { PendingAdministratorAction } from '@/types/admin-administrators';
import type { AdminAccount } from '@/types/admins';
import type { PaginatedList } from '@/types/api';
import type { SessionProfile } from '@/types/auth';

/**
 * ADMINISTRATORS: THERE IS NO ADMIN SIGN-UP, SO NEW ADMINISTRATORS ARE ADDED
 * HERE. EACH GETS A ONE-TIME SETUP CODE TO CHOOSE THEIR PASSWORD; A NEW CODE
 * ALSO RESETS A FORGOTTEN ONE. YOU CANNOT DEACTIVATE YOURSELF OR THE LAST ADMIN.
 */
export function AdminAdministrators() {
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<AdministratorForm>(EMPTY_ADMINISTRATOR_FORM);
  const [pendingAction, setPendingAction] = useState<PendingAdministratorAction | null>(null);
  const [issuedCode, setIssuedCode] = useState<{ setupCode: IssuedSetupCode; fullName: string } | null>(null);

  const list = useApiQuery<PaginatedList<AdminAccount>>(API_PATHS.admins, { page, limit: 20 });
  const me = useApiQuery<SessionProfile>(API_PATHS.auth.me);

  const create = useMutation((values: AdministratorForm) => createAdministrator(values), {
    successMessage: (administrator) => `Added ${administrator.fullName}.`,
    onSuccess: (administrator) => {
      setIsFormOpen(false);
      list.reload();
      if (administrator.setupCode) setIssuedCode({ setupCode: administrator.setupCode, fullName: administrator.fullName });
    },
  });

  const issueCode = useMutation((administrator: AdminAccount) => issueAdministratorSetupCode(administrator.id), {
    onSuccess: (setupCode) => {
      if (pendingAction) setIssuedCode({ setupCode, fullName: pendingAction.administrator.fullName });
      setPendingAction(null);
      list.reload();
    },
  });

  const changeStatus = useMutation(
    (administrator: AdminAccount) => (administrator.isActive ? deactivateAccount(administrator.id) : reactivateAccount(administrator.id)),
    {
      successMessage: (change) => (change.isActive ? 'The administrator can sign in again.' : 'The administrator can no longer sign in.'),
      onSuccess: () => {
        setPendingAction(null);
        list.reload();
      },
    },
  );

  const target = pendingAction?.administrator;
  const isCodeAction = pendingAction?.kind === 'setupCode';
  const activeMutation = isCodeAction ? issueCode : changeStatus;

  const columns: DataTableColumn<AdminAccount>[] = [
    {
      key: 'name',
      header: 'Administrator',
      cell: (administrator) => (
        <div className='min-w-0'>
          <p className='font-medium text-foreground'>
            {administrator.fullName}
            {administrator.id === me.data?.id && <span className='ml-1.5 text-xs font-normal text-muted-foreground'>(you)</span>}
          </p>
          <p className='font-mono text-xs break-all text-muted-foreground'>{administrator.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (administrator) => (
        <div className='flex flex-wrap gap-1.5'>
          <AccountStatusBadge isActive={administrator.isActive} />
          {!administrator.passwordSetAt && <StatusBadge tone='warning'>Setup pending</StatusBadge>}
        </div>
      ),
    },
    {
      key: 'added',
      header: 'Added',
      className: 'hidden md:table-cell',
      cell: (administrator) => <span className='font-mono text-sm'>{formatDate(administrator.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className='sr-only'>Actions</span>,
      align: 'right',
      cell: (administrator) => (
        <div className='flex justify-end gap-1'>
          {administrator.isActive && (
            <Button variant='ghost' size='sm' onClick={() => openAction('setupCode', administrator)} aria-label={`New setup code for ${administrator.fullName}`}>
              <KeyRoundIcon aria-hidden />
              New setup code
            </Button>
          )}
          {administrator.id !== me.data?.id && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => openAction('status', administrator)}
              aria-label={`${administrator.isActive ? 'Deactivate' : 'Reactivate'} ${administrator.fullName}`}
              className={administrator.isActive ? 'text-destructive hover:text-destructive' : undefined}
            >
              {administrator.isActive ? <UserXIcon aria-hidden /> : <UserCheckIcon aria-hidden />}
              {administrator.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  function openCreate() {
    setForm(EMPTY_ADMINISTRATOR_FORM);
    create.reset();
    setIsFormOpen(true);
  }

  function openAction(kind: PendingAdministratorAction['kind'], administrator: AdminAccount) {
    issueCode.reset();
    changeStatus.reset();
    setPendingAction({ kind, administrator });
  }

  function handleActionOpenChange(isOpen: boolean) {
    if (!isOpen) setPendingAction(null);
  }

  function confirmAction() {
    if (!pendingAction) return;
    void activeMutation.run(pendingAction.administrator);
  }

  function updateField(field: keyof AdministratorForm) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      create.setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ADMINISTRATOR_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      create.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void create.run(parsed.data);
  }

  return (
    <>
      <PageHeader
        title='Administrators'
        description='School office staff who use this portal. There is no public sign-up: new administrators are added here and choose their password with a one-time setup code.'
        actions={
          <Button onClick={openCreate}>
            <PlusIcon aria-hidden />
            New administrator
          </Button>
        }
      />

      <DataTable
        label='Administrators'
        columns={columns}
        rows={list.data?.items ?? null}
        getRowKey={(administrator) => administrator.id}
        isLoading={list.isLoading}
        errorMessage={list.errorMessage}
        onRetry={list.reload}
        empty={<EmptyState icon={ShieldCheckIcon} title='No administrators' description='Add an administrator to share the work of the school office.' />}
        footer={<PaginationBar pagination={list.data?.pagination ?? null} onPageChange={setPage} isDisabled={list.isLoading} noun='administrators' />}
      />

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title='New administrator'
        description='They get full access to this portal. You will get a one-time setup code to give them, so they can choose their own password.'
        submitLabel='Add administrator'
        isSubmitting={create.isPending}
        formError={create.formError}
        onSubmit={handleSubmit}
      >
        <FormField id='fullName' label='Full name' error={create.fieldErrors.fullName} isRequired>
          <Input {...fieldControlProps('fullName', create.fieldErrors.fullName)} value={form.fullName} onChange={updateField('fullName')} autoComplete='off' />
        </FormField>
        <FormField id='email' label='Email' description='They sign in with this. It cannot be changed later.' error={create.fieldErrors.email} isRequired>
          <Input
            {...fieldControlProps('email', create.fieldErrors.email, true)}
            type='email'
            value={form.email}
            onChange={updateField('email')}
            className='font-mono'
            autoComplete='off'
            spellCheck={false}
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onOpenChange={handleActionOpenChange}
        title={
          isCodeAction ? `Issue a new setup code for ${target?.fullName}?` : `${target?.isActive ? 'Deactivate' : 'Reactivate'} ${target?.fullName}?`
        }
        description={
          isCodeAction
            ? 'The new code replaces any earlier one. It works once and expires after 7 days. Use it for their first setup, or when they have forgotten their password.'
            : target?.isActive
              ? `${target.fullName} will be signed out everywhere straight away and won't be able to sign in. You can reactivate the account later.`
              : `${target?.fullName} will be able to sign in again.`
        }
        confirmLabel={isCodeAction ? 'Issue code' : target?.isActive ? 'Deactivate' : 'Reactivate'}
        tone={!isCodeAction && target?.isActive ? 'destructive' : 'default'}
        isPending={activeMutation.isPending}
        errorMessage={activeMutation.formError}
        onConfirm={confirmAction}
      />

      <SetupCodeDialog setupCode={issuedCode?.setupCode ?? null} personName={issuedCode?.fullName ?? ''} onClose={() => setIssuedCode(null)} />
    </>
  );
}
