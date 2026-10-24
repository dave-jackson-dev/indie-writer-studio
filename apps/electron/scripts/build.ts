import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/**
 * Builds the Electron app into `dist/apps/electron`, a directory Electron can run (`electron <dir>`):
 * `main.mjs` (ESM), `preload.cjs` (the sandbox needs CommonJS), the renderer (the built Writer app), and a `package.json`
 * naming the entry. Dependencies stay external and resolve from the repository's `node_modules`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = join(root, 'dist/apps/electron');
const tsconfig = join(root, 'apps/electron/tsconfig.app.json');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  tsconfig,
  logLevel: 'warning',
} as const;

await build({
  ...common,
  entryPoints: [join(root, 'apps/electron/src/main.ts')],
  outfile: join(out, 'main.mjs'),
  format: 'esm',
  external: [
    'electron',
    '@nestjs/*',
    'rxjs',
    'reflect-metadata',
    'express',
    'cors',
    'class-transformer',
    'class-validator',
  ],
  // Some bundled packages are CommonJS and call `require`; an ES module has none of its own.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await build({
  ...common,
  entryPoints: [join(root, 'apps/electron/src/preload.ts')],
  outfile: join(out, 'preload.cjs'),
  format: 'cjs',
  external: ['electron'],
});

// The renderer is the Writer app (apps/writer), built before this runs; it ships as it was built.
const writer = join(root, 'dist/apps/writer');
if (!existsSync(join(writer, 'index.html'))) {
  throw new Error(`The renderer is not built: ${writer}/index.html is missing (nx build writer).`);
}
cpSync(writer, join(out, 'renderer'), { recursive: true });
writeFileSync(
  join(out, 'package.json'),
  `${JSON.stringify({ name: 'indie-writer-studio', version: '0.0.1', main: 'main.mjs', type: 'module' }, null, 2)}\n`,
);
console.log(`Built the Electron app into ${out}.`);
