import "server-only";
import { z } from "zod";

/**
 * Environment validation for Supabase clients.
 *
 * Validation is lazy: nothing is read or checked at import time, so the app
 * builds and runs without Supabase configured. Each client factory calls the
 * relevant getter when it is initialized and fails fast if config is missing.
 */

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

const supabaseAdminEnvSchema = supabaseEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().trim().min(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminEnvSchema>;

type EnvSource = Record<string, string | undefined>;

/** Lists the offending variable names only — never their values. */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(
      `Missing or invalid environment variables: ${variables.join(", ")}. ` +
        "See .env.example.",
    );
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

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

/** Config for the cookie-aware, RLS-respecting server client. */
export function getSupabaseEnv(source: EnvSource = process.env): SupabaseEnv {
  return parseEnv(supabaseEnvSchema, source);
}

/** Config for the service-role admin client. Server-only. */
export function getSupabaseAdminEnv(
  source: EnvSource = process.env,
): SupabaseAdminEnv {
  return parseEnv(supabaseAdminEnvSchema, source);
}
