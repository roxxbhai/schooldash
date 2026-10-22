'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ROLE_SIGN_IN_PATHS, SIGN_IN_REASONS } from '@/constants/routes';
import { signOut } from '@/functions/auth';
import type { AppRole } from '@/types/auth';

/**
 * SIGNS OUT THROUGH POST /api/auth/logout, THEN DOES A FULL PAGE LOAD OF THE
 * ROLE'S OWN SIGN-IN PAGE, WHICH ALSO DISCARDS EVERY PIECE OF IN-MEMORY CLIENT STATE.
 */
export function useSignOut(role: AppRole) {
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
    window.location.replace(`${ROLE_SIGN_IN_PATHS[role]}?reason=${SIGN_IN_REASONS.signedOut}`);
  }

  return { signOutNow, isSigningOut };
}
