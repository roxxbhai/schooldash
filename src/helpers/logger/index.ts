import 'server-only';

/**
 * LOGS A SERVER-SIDE FAILURE WITHOUT ITS MESSAGE, STACK, OR PAYLOAD.
 *
 * ERROR MESSAGES FROM Supabase/PostgREST CAN ECHO EMAILS, QUERY VALUES, OR
 * TOKEN FRAGMENTS, SO ONLY CLASSIFYING METADATA (NAME, CODE, STATUS) IS
 * RECORDED. NEVER PASS REQUEST BODIES, COOKIES, OR TOKENS IN `context`.
 */
export function logServerError(
  event: string,
  error: unknown,
  context: Record<string, string | number | boolean | readonly string[]> = {},
): void {
  const entry: Record<string, unknown> = { level: 'error', event, ...context };

  if (error instanceof Error) {
    entry.errorName = error.name;
    const { code, status } = error as { code?: unknown; status?: unknown };
    if (typeof code === 'string' && code) entry.errorCode = code;
    if (typeof status === 'number') entry.errorStatus = status;
  } else {
    entry.errorName = typeof error;
  }

  console.error(JSON.stringify(entry));
}
