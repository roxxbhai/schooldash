import type { NextRequest } from 'next/server';
import { updateSession } from '@/helpers/supabase-proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // EVERYTHING EXCEPT STATIC ASSETS, IMAGE OPTIMIZATION AND METADATA FILES.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
