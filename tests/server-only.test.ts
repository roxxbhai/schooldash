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
  'functions/account-status/index.ts',
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

  it('every config, helper, function and domain module is server-only', () => {
    // THE BROWSER CLIENT AND THE PROXY SESSION HELPER ARE THE ONLY HELPERS ALLOWED OUTSIDE THE SERVER.
    const modules = sourceFiles()
      .map(rel)
      .filter((file) => /^(configs|functions|helpers|lib)\/(?!supabase-(browser|proxy)\/)/.test(file) && file.endsWith('.ts'));
    for (const file of modules) {
      expect(read(file).match(/^import\s+[^;]+;/m)?.[0], file).toBe("import 'server-only';");
    }
    expect(modules.length).toBeGreaterThanOrEqual(SERVER_ONLY_MODULES.length);
  });

  it('no client module imports server-only modules', () => {
    const forbidden = /from\s+["'](?:@\/|\.{1,2}\/)[^"']*(?:configs|functions\/|helpers\/(?!supabase-browser)|lib\/)[^"']*["']/;
    const offenders = sourceFiles()
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return isClientModule(source) && forbidden.test(source);
      })
      .map(rel);
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

  it('only the provisioning and account-status services import the admin (secret-key) client', () => {
    const importsAdmin = /from\s+["'][^"']*supabase-admin["']/;
    const importers = sourceFiles()
      .filter((file) => importsAdmin.test(readFileSync(file, 'utf8')))
      .map(rel);
    expect(importers.sort()).toEqual(['functions/account-status/index.ts', 'functions/provisioning/index.ts']);
  });

  it('only the admin-guarded people routes import provisioning, and they check requireAdmin before creating an account', () => {
    const importsProvisioning = /from\s+["'][^"']*functions\/provisioning["']/;
    const importers = sourceFiles()
      .filter((file) => rel(file).startsWith('app/'))
      .filter((file) => importsProvisioning.test(readFileSync(file, 'utf8')))
      .map(rel)
      .sort();
    expect(importers).toEqual(['app/api/students/route.ts', 'app/api/teachers/route.ts']);

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
