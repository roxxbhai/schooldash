import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN AND ASSET RULES FOR THE PORTAL FRONTEND, CHECKED STATICALLY:
 * SQUARE CORNERS, COLOURS ONLY FROM THE DESIGN TOKENS, AND SCHOOL PHOTOGRAPHS
 * ONLY ON THE AUTHENTICATION SCREENS.
 */

const root = path.resolve(__dirname, '../src');

function filesUnder(dir: string): string[] {
  const absolute = path.join(root, dir);
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

const uiFiles = [...filesUnder('components'), ...filesUnder('app')].filter((file) => !file.startsWith('app/api/'));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('frontend conventions', () => {
  it('uses square corners only (no rounded-* utilities other than rounded-none / rounded-[inherit])', () => {
    const offenders = uiFiles.flatMap((file) =>
      [...read(file).matchAll(/\brounded-(?!none\b|\[inherit\])[\w[\]/.-]+/g)].map((match) => `${file}: ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('takes colours from the design tokens, never hardcoded hex values in components', () => {
    const offenders = uiFiles
      .filter((file) => file.endsWith('.tsx'))
      .flatMap((file) => [...read(file).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => `${file}: ${match[0]}`));
    expect(offenders).toEqual([]);
  });

  it('shows the school photographs only on the authentication screens', () => {
    const photoPaths = [...filesUnder('components'), ...filesUnder('app'), ...filesUnder('constants')].filter((file) =>
      read(file).includes('/images/school/'),
    );
    expect(photoPaths).toEqual(['constants/auth-photos/index.ts']);

    const photoUsers = uiFiles.filter((file) => /from\s+["']@\/constants\/auth-photos["']/.test(read(file)));
    expect(photoUsers).toEqual(['components/auth-photo-panel/index.tsx']);

    const panelUsers = uiFiles.filter((file) => /from\s+["']@\/components\/auth-photo-panel["']/.test(read(file)));
    expect(panelUsers).toEqual(['app/(auth)/layout.tsx']);
  });

  it('defines a state variant for every data-<state>: shorthand the components use', () => {
    // RADIX MARKS STATE WITH data-state="…", SO SHORTHANDS LIKE data-open: ONLY WORK THROUGH A @custom-variant IN globals.css.
    const css = read('app/globals.css');
    const used = new Set(uiFiles.flatMap((file) => [...read(file).matchAll(/\bdata-(open|closed|checked|unchecked|active|selected|disabled)(?=[:/])/g)].map((match) => match[1])));
    const missing = [...used].filter((state) => !new RegExp(`@custom-variant data-${state}\\b`).test(css));
    expect(missing).toEqual([]);
  });

  it('loads Geist Sans (and no monospace face) from the single fonts module', () => {
    const fontUsers = [...uiFiles, ...filesUnder('fonts')].filter((file) => /from\s+["']next\/font\//.test(read(file)));
    expect(fontUsers).toEqual(['fonts/index.ts']);
    const fonts = read('fonts/index.ts');
    expect(fonts).toMatch(/Geist\(/);
    expect(fonts).not.toMatch(/Geist_Mono\(/);
  });
});
