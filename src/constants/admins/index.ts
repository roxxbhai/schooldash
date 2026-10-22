import type { DbErrorContext } from '@/types/supabase';

export const ADMIN_COLUMNS = 'id, fullName, email, isActive, passwordSetAt, createdAt';

export const ADMIN_ERRORS: DbErrorContext = { notFoundMessage: 'Administrator not found.' };
