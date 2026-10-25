import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const SYNCFUSION_VERSION = '35.1.37';

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

const componentSources = sourceFiles(join(here, 'app')).filter(
  (file) => !file.endsWith('.spec.ts'),
);

describe('the renderer under its content security policy (ADR-005)', () => {
  it.each(componentSources.map((file) => [file.slice(root.length + 1), file]))(
    '%s gives Syncfusion no string template, which it would compile with eval',
    (_name, file) => {
      const source = readFileSync(file as string, 'utf8');
      // A selector string such as template="#id", or a template property holding a string.
      expect(source).not.toMatch(/\btemplate="#/);
      expect(source).not.toMatch(
        /\b(?:itemTemplate|headerTemplate|footerTemplate|nodeTemplate|emptyRecordTemplate)\s*[:=]\s*['"`]/,
      );
    },
  );

  it('keeps the page free of inline scripts and event-handler attributes', () => {
    const page = readFileSync(join(here, 'index.html'), 'utf8');
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(page).not.toMatch(/\son[a-z]+="/);
  });
});

describe('Syncfusion is one pinned version (ADR-005)', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
    ([name]) => name.startsWith('@syncfusion/'),
  );

  it('declares every Syncfusion package at exactly one version, with no range', () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.map(([, version]) => version)).toEqual(declared.map(() => SYNCFUSION_VERSION));
  });

  it('has installed only that version, transitive packages included', () => {
    const dir = join(root, 'node_modules/@syncfusion');
    const versions = readdirSync(dir)
      .filter((name) => statSync(join(dir, name)).isDirectory())
      .map((name) => [
        name,
        (JSON.parse(readFileSync(join(dir, name, 'package.json'), 'utf8')) as { version: string })
          .version,
      ]);
    expect(versions.filter(([, version]) => version !== SYNCFUSION_VERSION)).toEqual([]);
  });
});
