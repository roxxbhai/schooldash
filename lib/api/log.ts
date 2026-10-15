import "server-only";

/**
 * Logs a server-side failure without its message, stack, or payload.
 *
 * Error messages from Supabase/PostgREST can echo emails, query values, or
 * token fragments, so only classifying metadata (name, code, status) is
 * recorded. Never pass request bodies, cookies, or tokens in `context`.
 */
export function logServerError(
  event: string,
  error: unknown,
  context: Record<string, string | number | boolean | readonly string[]> = {},
): void {
  const entry: Record<string, unknown> = { level: "error", event, ...context };

  if (error instanceof Error) {
    entry.errorName = error.name;
    const { code, status } = error as { code?: unknown; status?: unknown };
    if (typeof code === "string" && code) entry.errorCode = code;
    if (typeof status === "number") entry.errorStatus = status;
  } else {
    entry.errorName = typeof error;
  }

  console.error(JSON.stringify(entry));
}
