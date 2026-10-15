import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const SERVER_ONLY_MODULES = [
  "lib/env.ts",
  "lib/supabase/server.ts",
  "lib/supabase/admin.ts",
  "lib/api/csrf.ts",
  "lib/api/errors.ts",
  "lib/api/log.ts",
  "lib/api/response.ts",
  "lib/api/validation.ts",
  "lib/auth/authorization.ts",
  "lib/auth/provisioning.ts",
  "lib/auth/repository.ts",
  "lib/auth/roles.ts",
  "lib/auth/session.ts",
];

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(path.join(root, dir));
  return files;
}

const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const rel = (file: string) => path.relative(root, file);
const isClientModule = (source: string) => /^\s*["']use client["']/.test(source);

describe("server-only isolation", () => {
  it.each(SERVER_ONLY_MODULES)("%s imports server-only before anything else", (file) => {
    const firstImport = read(file).match(/^import\s+[^;]+;/m)?.[0];
    expect(firstImport).toBe('import "server-only";');
  });

  it("the server-only guard throws when resolved outside the server build", () => {
    // Bypasses the Vitest alias to load the real package, as a client bundle would.
    const requireReal = createRequire(path.join(root, "package.json"));
    expect(() => requireReal("server-only")).toThrow(/Client Component/);
  });

  it("every lib/auth and lib/api module is listed as server-only", () => {
    const modules = sourceFiles()
      .map(rel)
      .filter((file) => /^lib\/(auth|api)\//.test(file));
    expect(modules.every((file) => SERVER_ONLY_MODULES.includes(file))).toBe(true);
  });

  it("no client module imports server-only modules", () => {
    const forbidden = /from\s+["'](?:@\/|\.{1,2}\/)[^"']*(?:lib\/env|lib\/auth|lib\/api|supabase\/server|supabase\/admin)[^"']*["']/;
    const offenders = sourceFiles()
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return isClientModule(source) && forbidden.test(source);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("the service-role key is referenced only by the env and admin modules", () => {
    const readers = sourceFiles()
      .filter((file) => readFileSync(file, "utf8").includes("SUPABASE_SECRET_KEY"))
      .map(rel);
    expect(readers.sort()).toEqual(["lib/env.ts", "lib/supabase/admin.ts"]);
  });

  it("the service-role key is never exposed through a NEXT_PUBLIC_ variable", () => {
    const pattern = /NEXT_PUBLIC_\w*SERVICE/;
    for (const file of sourceFiles()) {
      expect(readFileSync(file, "utf8"), rel(file)).not.toMatch(pattern);
    }
    expect(read(".env.example")).not.toMatch(pattern);
  });

  it("only the provisioning service imports the admin (secret-key) client", () => {
    const importsAdmin = /from\s+["'][^"']*supabase\/admin["']/;
    const importers = sourceFiles()
      .filter((file) => importsAdmin.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(importers).toEqual(["lib/auth/provisioning.ts"]);
  });

  it("no API route imports the provisioning service (no public account creation)", () => {
    const importsProvisioning = /from\s+["'][^"']*auth\/provisioning["']/;
    const offenders = sourceFiles()
      .filter((file) => rel(file).startsWith("app/"))
      .filter((file) => importsProvisioning.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("the browser client and proxy use only public configuration", () => {
    for (const file of ["lib/supabase/client.ts", "lib/supabase/proxy.ts", "proxy.ts"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/process\.env\.(SUPABASE_SECRET_KEY|SUPABASE_DB_URL)/);
      expect(source, file).not.toMatch(/from\s+["'][^"']*(supabase\/admin|lib\/env|auth\/provisioning)["']/);
    }
  });

  it("only the admin module uses the service-role client factory", () => {
    const users = sourceFiles()
      .filter((file) => readFileSync(file, "utf8").includes("getSupabaseAdminEnv"))
      .map(rel)
      .sort();
    expect(users).toEqual(["lib/env.ts", "lib/supabase/admin.ts"]);
  });
});
