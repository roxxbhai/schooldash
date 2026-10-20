import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SignOutButton } from '@/components/sign-out-button';
import { ROLE_HOME_PATHS, ROUTES } from '@/constants/routes';
import { getCurrentAppUser } from '@/functions/session';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

const PORTAL_NAMES = { TEACHER: 'teacher', STUDENT: 'student' } as const;

/** FOR SIGNED-IN TEACHERS AND STUDENTS UNTIL THEIR PORTALS ARE BUILT. ADMINS GO TO THE ADMIN PORTAL; EVERYONE ELSE TO SIGN-IN. */
export async function AccessDeniedContent() {
  // REQUEST TIME ONLY: THE SUPABASE CLIENT READS THE CLOCK AND COOKIES, WHICH MUST NEVER BE PRERENDERED.
  await connection();
  const supabase = await createSupabaseServerClient();
  const result = await getCurrentAppUser(supabase);

  if (!result.success) redirect(ROUTES.signIn);
  if (result.data.role === 'ADMIN') redirect(ROLE_HOME_PATHS.ADMIN);

  return (
    <div>
      <p className='text-base text-foreground'>
        You are signed in as <span className='font-medium'>{result.data.fullName}</span>{' '}
        <span className='font-mono text-sm text-muted-foreground'>({result.data.email})</span>.
      </p>
      <p className='mt-3 text-base text-muted-foreground'>
        The {PORTAL_NAMES[result.data.role]} portal is not available yet. The school office will let you know when it opens. Your account is
        ready, so there is nothing else you need to do.
      </p>
      <SignOutButton className='mt-8' />
    </div>
  );
}
