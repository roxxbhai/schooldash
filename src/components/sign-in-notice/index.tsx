'use client';

import { useSearchParams } from 'next/navigation';
import { FormAlert } from '@/components/form-alert';
import { SIGN_IN_NOTICES } from '@/constants/auth-forms';

/** EXPLAINS WHY THE PERSON IS ON THE SIGN-IN PAGE (SESSION ENDED, SIGNED OUT, PASSWORD SET …). */
export function SignInNotice() {
  const searchParams = useSearchParams();
  const notice = SIGN_IN_NOTICES[searchParams.get('reason') ?? ''];

  if (!notice) return null;

  return (
    <FormAlert tone={notice.tone} className='mb-5'>
      {notice.message}
    </FormAlert>
  );
}
