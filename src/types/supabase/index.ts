import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** A SUPABASE CLIENT TYPED WITH THE GENERATED SCHEMA. */
export type DbClient = SupabaseClient<Database>;

/** THE SHAPE SUPABASE-JS RETURNS FOR POSTGREST/POSTGRES ERRORS. */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export interface ConstraintRule {
  /** CLIENT-FACING MESSAGE. */
  message: string;
  /** REQUEST FIELD THE CONSTRAINT RELATES TO (FOR 422 DETAILS). */
  field?: string;
}

export interface DbErrorContext {
  /** FRIENDLY MESSAGES FOR SPECIFIC CONSTRAINTS, KEYED BY CONSTRAINT NAME. */
  constraints?: Record<string, ConstraintRule>;
  /** MESSAGE FOR "NO SUCH ROW" (PGRST116 / P0002). */
  notFoundMessage?: string;
}

export interface QueryResult<T> {
  data: T | null;
  error: DbErrorLike | null;
  count?: number | null;
}
