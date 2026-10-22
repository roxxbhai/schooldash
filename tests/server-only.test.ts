import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
// APPLICATION SOURCE LIVES UNDER src/; PATHS BELOW ARE RELATIVE TO IT.
const root = path.join(repoRoot, 'src');
const SOURCE_DIRS = ['app', 'components', 'configs', 'constants', 'functions', 'helpers', 'lib', 'types'];
const SERVER_ONLY_MODULES = [
  'configs/index.ts',
  'helpers/supabase-server/index.ts',
  'helpers/supabase-admin/index.ts',
  'helpers/csrf/index.ts',
  'helpers/db-error/index.ts',
  'helpers/api-error/index.ts',
  'helpers/logger/index.ts',
  'helpers/api-response/index.ts',
  'helpers/request-validation/index.ts',
  'functions/account-setup/index.ts',
  'functions/account-status/index.ts',
  'helpers/account-setup/index.ts',
  'functions/authorization/index.ts',
  'functions/provisioning/index.ts',
  'helpers/roles/index.ts',
  'functions/session/index.ts',
  'helpers/db-query/index.ts',
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
  for (const dir of SOURCE_DIRS) if (existsSync(path.join(root, dir))) walk(path.join(root, dir));
  return files;
}

const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const rel = (file: string) => path.relative(root, file);
const isClientModule = (source: string) => /^\s*["']use client["']/.test(source);

/** WHICH SIDE A MODULE DECLARES WITH ITS FIRST IMPORT. */
function sideOf(file: string): 'server' | 'client' | 'pure' {
  const firstImport = read(file).match(/^import\s+[^;]+;/m)?.[0];
  if (firstImport === "import 'server-only';") return 'server';
  if (firstImport === "import 'client-only';") return 'client';
  return 'pure';
}

/** THE src/-RELATIVE FILES A MODULE IMPORTS THROUGH `@/…` OR RELATIVE PATHS (TYPE-ONLY IMPORTS EXCLUDED). */
function localImports(file: string): string[] {
  const targets: string[] = [];
  for (const [, specifier] of read(file).matchAll(/^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) {
    const base = specifier.startsWith('@/')
      ? path.join(root, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(path.join(root, file)), specifier)
        : null;
    if (!base) continue;
    const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
    const found = candidates.find((candidate) => existsSync(candidate) && candidate.match(/\.(ts|tsx)$/));
    if (found) targets.push(path.relative(root, found));
  }
  return targets;
}

describe('server-only isolation', () => {
  it.each(SERVER_ONLY_MODULES)('%s imports server-only before anything else', (file) => {
    const firstImport = read(file).match(/^import\s+[^;]+;/m)?.[0];
    expect(firstImport).toBe("import 'server-only';");
  });

  it('the server-only guard throws when resolved outside the server build', () => {
    // Bypasses the Vitest alias to load the real package, as a client bundle would.
    const requireReal = createRequire(path.join(repoRoot, 'package.json'));
    expect(() => requireReal('server-only')).toThrow(/Client Component/);
  });

  it('every function and config module declares its side; helpers declare one or stay pure', () => {
    // SERVER MODULES START WITH `import 'server-only'`, BROWSER MODULES WITH `import 'client-only'`. A HELPER WITH
    // NEITHER MUST BE PURE (SAFE ON BOTH SIDES). THE BROWSER CLIENT AND PROXY SESSION HELPERS ARE THE KNOWN EXCEPTIONS.
    const modules = sourceFiles()
      .map(rel)
      .filter((file) => /^(configs|functions|helpers|lib)\//.test(file) && file.endsWith('.ts'))
      .filter((file) => !/^helpers\/supabase-(browser|proxy)\//.test(file));
    for (const file of modules) {
      const marker = sideOf(file);
      if (file.startsWith('configs/')) expect(marker, file).toBe('server');
      if (file.startsWith('functions/')) expect(marker, file).not.toBe('pure');
      if (marker !== 'pure') continue;
      const source = read(file);
      expect(source, `${file} reads environment variables`).not.toMatch(/process\.env/);
      expect(source, `${file} imports server APIs`).not.toMatch(/from\s+["'](next\/headers|server-only|client-only)["']/);
      for (const target of localImports(file)) expect(sideOf(target), `${file} imports ${target}`).toBe('pure');
    }
    expect(modules.filter((file) => sideOf(file) === 'server').length).toBeGreaterThanOrEqual(SERVER_ONLY_MODULES.length);
  });

  it('no browser module imports a server-only module', () => {
    const offenders = sourceFiles()
      .map(rel)
      .filter((file) => isClientModule(read(file)) || sideOf(file) === 'client')
      .flatMap((file) => localImports(file).filter((target) => sideOf(target) === 'server').map((target) => `${file} -> ${target}`));
    expect(offenders).toEqual([]);
  });

  it('the service-role key is referenced only by the env and admin modules', () => {
    const readers = sourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes('SUPABASE_SECRET_KEY'))
      .map(rel);
    expect(readers.sort()).toEqual(['configs/index.ts', 'helpers/supabase-admin/index.ts']);
  });

  it('the service-role key is never exposed through a NEXT_PUBLIC_ variable', () => {
    const pattern = /NEXT_PUBLIC_\w*SERVICE/;
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8'), rel(file)).not.toMatch(pattern);
    }
    expect(readFileSync(path.join(repoRoot, '.env.example'), 'utf8')).not.toMatch(pattern);
  });

  it('only the provisioning, account-status, account-setup and sign-in services import the admin (secret-key) client', () => {
    const importsAdmin = /from\s+["'][^"']*supabase-admin["']/;
    const importers = sourceFiles()
      .filter((file) => importsAdmin.test(readFileSync(file, 'utf8')))
      .map(rel);
    // ACCOUNT SETUP READS THE SERVICE-ROLE-ONLY CODES TABLE AND SETS AUTH PASSWORDS.
    expect(importers.sort()).toEqual(['functions/account-setup/index.ts', 'functions/account-status/index.ts', 'functions/provisioning/index.ts', 'functions/sign-in/index.ts']);
  });

  it('only the admin-guarded people routes import provisioning, and they check requireAdmin before creating an account', () => {
    const importsProvisioning = /from\s+["'][^"']*functions\/provisioning["']/;
    const importers = sourceFiles()
      .filter((file) => rel(file).startsWith('app/'))
      .filter((file) => importsProvisioning.test(readFileSync(file, 'utf8')))
      .map(rel)
      .sort();
    expect(importers).toEqual(['app/api/admins/route.ts', 'app/api/students/route.ts', 'app/api/teachers/route.ts']);

    for (const file of importers) {
      // EVERY HANDLER THAT PROVISIONS AN ACCOUNT MUST HAVE PASSED THE ADMIN GUARD FIRST.
      const handlers = read(file).split(/^export const /m).filter((handler) => handler.includes('provisionAccount('));
      expect(handlers.length, file).toBeGreaterThan(0);
      for (const handler of handlers) {
        const guardAt = handler.indexOf('requireAdmin(');
        expect(guardAt, file).toBeGreaterThan(-1);
        expect(guardAt, file).toBeLessThan(handler.indexOf('provisionAccount('));
      }
    }
  });

  it('the browser client and proxy use only public configuration', () => {
    for (const file of ['helpers/supabase-browser/index.ts', 'helpers/supabase-proxy/index.ts', 'proxy.ts']) {
      const source = read(file);
      expect(source, file).not.toMatch(/process\.env\.(SUPABASE_SECRET_KEY|SUPABASE_DB_URL)/);
      expect(source, file).not.toMatch(/from\s+["'][^"']*(supabase-admin|@\/configs|functions\/provisioning)["']/);
    }
  });

  it('only the admin module uses the service-role client factory', () => {
    const users = sourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes('getSupabaseAdminEnv'))
      .map(rel)
      .sort();
    expect(users).toEqual(['configs/index.ts', 'helpers/supabase-admin/index.ts']);
  });
});
