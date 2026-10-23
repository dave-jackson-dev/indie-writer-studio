import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * `tsconfig.base.json`'s `paths`, as Vite aliases.
 *
 * Derived, never duplicated: a second copy of the mappings is a second thing to forget, and the
 * failure mode is a test importing the wrong copy of a library.
 */
export const workspaceAliases = (): ReadonlyArray<{ find: string; replacement: string }> => {
  const paths: Record<string, readonly string[]> =
    JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.base.json'), 'utf8')).compilerOptions?.paths ??
    {};
  return Object.entries(paths).map(([find, targets]) => ({
    find,
    replacement: resolve(ROOT, targets[0] as string),
  }));
};

export const testDefaults = (name: string) => ({
  name,
  globals: false,
  environment: 'node' as const,
  passWithNoTests: false,
});
