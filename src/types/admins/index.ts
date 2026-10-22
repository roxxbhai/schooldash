import type { IssuedSetupCode } from '@/types/account-setup';
import type { Tables } from '@/types/database';

/** AN ADMINISTRATOR ACCOUNT (A `users` ROW WITH THE ADMIN ROLE). */
export type AdminAccount = Pick<Tables<'users'>, 'id' | 'fullName' | 'email' | 'isActive' | 'passwordSetAt' | 'createdAt'>;

/** POST /api/admins: THE NEW ADMINISTRATOR, PLUS THEIR FIRST SETUP CODE (NULL WHEN ONE COULD NOT BE ISSUED). */
export type CreatedAdmin = AdminAccount & { setupCode: IssuedSetupCode | null };
