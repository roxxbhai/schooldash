import type { Tables } from '@/types/database';

/** "grade" IS A SORT KEY DERIVED FROM "name" (MIGRATION 18); IT IS NEVER SELECTED. */
export type SchoolClass = Omit<Tables<'classes'>, 'grade'>;
