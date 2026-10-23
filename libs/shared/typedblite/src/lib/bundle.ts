import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory holding `nx.json`, found by walking up from this file (also from a built bundle in `dist/`). */
export function repositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(resolve(directory, 'nx.json')) && dirname(directory) !== directory) {
    directory = dirname(directory);
  }
  return directory;
}

/** `vendor/typedblite/typedblite.mjs`: the pre-built engine committed with its provenance (ADR-003 D2). */
export const vendoredBundlePath = (): string =>
  join(repositoryRoot(), 'vendor', 'typedblite', 'typedblite.mjs');

/** `TYPEDBLITE_BUNDLE` when set (to try another build of the engine), else the vendored bundle. */
export const bundlePath = (env: NodeJS.ProcessEnv = process.env): string =>
  env['TYPEDBLITE_BUNDLE'] ?? vendoredBundlePath();
