import 'server-only';
import { z } from 'zod';

/**
 * ENVIRONMENT VALIDATION FOR SUPABASE CLIENTS.
 *
 * VALIDATION IS LAZY: NOTHING IS READ OR CHECKED AT IMPORT TIME, SO THE APP
 * BUILDS AND RUNS WITHOUT SUPABASE CONFIGURED. EACH CLIENT FACTORY CALLS THE
 * RELEVANT GETTER WHEN IT IS INITIALIZED AND FAILS FAST IF CONFIG IS MISSING.
 */

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

const supabaseAdminEnvSchema = supabaseEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().trim().min(1),
});


/** LISTS THE OFFENDING VARIABLE NAMES ONLY — NEVER THEIR VALUES. */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(
      `Missing or invalid environment variables: ${variables.join(', ')}. ` +
        'See .env.example.',
    );
    this.name = 'EnvValidationError';
    this.variables = variables;
  }
}

// INFERRED FROM THE SCHEMAS ABOVE, SO THE TYPES CAN NEVER DRIFT FROM THE CHECKS.
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminEnvSchema>;
type EnvSource = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const variables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new EnvValidationError(variables);
  }
  return result.data;
}

/** CONFIG FOR THE COOKIE-AWARE, RLS-respecting SERVER CLIENT. */
export function getSupabaseEnv(source: EnvSource = process.env): SupabaseEnv {
  return parseEnv(supabaseEnvSchema, source);
}

/** CONFIG FOR THE SERVICE-ROLE ADMIN CLIENT. SERVER-ONLY. */
export function getSupabaseAdminEnv(
  source: EnvSource = process.env,
): SupabaseAdminEnv {
  return parseEnv(supabaseAdminEnvSchema, source);
}
