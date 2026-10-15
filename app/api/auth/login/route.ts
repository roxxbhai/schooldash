import { z } from "zod";
import { assertSameOrigin } from "@/lib/api/csrf";
import { ok, apiRoute } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { signInWithPassword, toSessionProfile } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Strict: unknown fields such as `role` or `userId` are rejected, not ignored.
const loginSchema = z.strictObject({
  email: z
    .string({ error: "Email is required." })
    .trim()
    .pipe(z.email({ error: "Enter a valid email address." })),
  password: z
    .string({ error: "Password is required." })
    .min(1, { error: "Password is required." })
    .max(1024, { error: "Password is too long." }),
});

/**
 * Email + password sign-in. Sets the Supabase session cookies on success.
 * Does not register users, create application accounts, or assign roles.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const credentials = await parseJsonBody(request, loginSchema);

  const supabase = await createSupabaseServerClient();
  const user = await signInWithPassword(supabase, credentials);
  return ok(toSessionProfile(user));
});
