/**
 * Initial-administrator bootstrap (operator CLI — never an HTTP endpoint).
 *
 *   npm run bootstrap:admin -- --email you@school.org --name "Your Name"
 *
 * Requires SUPABASE_SECRET_KEY in .env.local, so only someone with project
 * secrets can run it. Refuses to run if any active admin already exists:
 * further admins are created by an existing admin through the application.
 *
 * Identity:
 *   - If an Auth user with this email exists (e.g. created in the dashboard
 *     under Authentication → Users → Add user), it is linked.
 *   - Otherwise one is created with a password you type (hidden; min 12 chars)
 *     or pass via BOOTSTRAP_ADMIN_PASSWORD.
 *
 * Re-running after a partial failure is safe: an orphaned Auth user is
 * linked rather than duplicated.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { ApiError } from "@/lib/api/errors";
import { ProvisioningRecoveryError, provisionAccount } from "@/lib/auth/provisioning";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function readHiddenPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const output = rl as unknown as { _writeToOutput: (text: string) => void };
  let prompted = false;
  output._writeToOutput = (text: string) => {
    if (!prompted) {
      process.stdout.write(text);
      prompted = true;
    }
  };
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  if (!values.email || !values.name) {
    console.error('Usage: npm run bootstrap:admin -- --email <email> --name "<full name>"');
    return 2;
  }

  const admin = createSupabaseAdminClient();

  const existingAdmin = await admin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("isActive", true)
    .limit(1);
  if (existingAdmin.error) {
    console.error(`Could not check for existing admins (code ${existingAdmin.error.code}).`);
    return 1;
  }
  if (existingAdmin.data.length > 0) {
    console.error("An active administrator already exists. Create further admins from the app.");
    return 1;
  }

  const authUser = await admin.rpc("findAuthUserIdByEmail", { email: values.email });
  if (authUser.error) {
    console.error(`Could not look up the Auth user (code ${authUser.error.code}).`);
    return 1;
  }

  let password: string | undefined;
  if (authUser.data) {
    console.log("Linking the existing Auth user for this email.");
  } else {
    password =
      process.env.BOOTSTRAP_ADMIN_PASSWORD ||
      (await readHiddenPassword("New admin password (min 12 chars, hidden): "));
  }

  try {
    const account = await provisionAccount(
      { email: values.email, fullName: values.name, role: "ADMIN", password },
      { client: admin, linkExistingAuthUser: true, actorUserId: null },
    );
    console.log(
      `Administrator ready. users.id=${account.userId} ` +
        `(${account.createdAuthUser ? "new" : "existing"} Auth user ${account.authUserId}).`,
    );
    console.log("Verify: sign in via POST /api/auth/login, then GET /api/auth/me should return role ADMIN.");
    return 0;
  } catch (error) {
    if (error instanceof ProvisioningRecoveryError) {
      console.error(error.message);
    } else if (error instanceof ApiError) {
      console.error(`${error.code}: ${error.message}`);
      for (const issue of error.details ?? []) console.error(`  - ${issue.path}: ${issue.message}`);
    } else {
      console.error("Provisioning failed:", (error as Error).name, (error as { code?: string }).code ?? "");
    }
    return 1;
  }
}

main().then((code) => process.exit(code));
