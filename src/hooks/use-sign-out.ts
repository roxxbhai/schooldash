'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ROUTES, SIGN_IN_REASONS } from '@/constants/routes';
import { signOut } from '@/functions/auth';

/**
 * SIGNS OUT THROUGH POST /api/auth/logout, THEN DOES A FULL PAGE LOAD OF THE
 * SIGN-IN PAGE, WHICH ALSO DISCARDS EVERY PIECE OF IN-MEMORY CLIENT STATE.
 */
export function useSignOut() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOutNow() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    const result = await signOut();
    if (!result.success) {
      setIsSigningOut(false);
      toast.error("Couldn't sign out", { description: result.message });
      return;
    }
    window.location.replace(`${ROUTES.signIn}?reason=${SIGN_IN_REASONS.signedOut}`);
  }

  return { signOutNow, isSigningOut };
}
