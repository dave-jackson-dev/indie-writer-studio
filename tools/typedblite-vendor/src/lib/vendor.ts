import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/** What a vendored bundle records about where it came from (ADR-003 D2). */
export interface Provenance {
  readonly package: string;
  readonly packageVersion: string;
  readonly siblingCommit: string;
  readonly licence: string;
  readonly bundle: string;
  readonly sha256: string;
  readonly bytes: number;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const vendorDirectory = join(root, 'vendor', 'typedblite');
export const bundleFile = 'typedblite.mjs';
export const provenanceFile = 'PROVENANCE.json';

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export interface Verification {
  readonly ok: boolean;
  readonly problem?: string;
}

/** The bundle is present and is the one its provenance file records. */
export function verifyVendored(directory = vendorDirectory): Verification {
  const bundle = join(directory, bundleFile);
  const recorded = join(directory, provenanceFile);
  if (!existsSync(bundle)) {
    return { ok: false, problem: `${bundleFile} is missing from ${directory}` };
  }
  if (!existsSync(recorded)) {
    return { ok: false, problem: `${provenanceFile} is missing from ${directory}` };
  }
  const provenance = JSON.parse(readFileSync(recorded, 'utf8')) as Provenance;
  const actual = sha256(readFileSync(bundle));
  return actual === provenance.sha256
    ? { ok: true }
    : {
        ok: false,
        problem: `${bundleFile} hash ${actual} differs from the recorded ${provenance.sha256}`,
      };
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * Bundles the sibling's built TypeDBLite runtime, with everything it imports, into one file.
 * Refuses a sibling that is not built, or has uncommitted changes: the commit recorded in the
 * provenance must be the code that was bundled.
 */
export async function bundleFromSibling(
  sibling: string,
  directory = vendorDirectory,
): Promise<Provenance> {
  const runtime = join(sibling, 'libs/core/typedblite/runtime');
  const entry = join(runtime, 'out/index.js');
  if (!existsSync(entry)) {
    throw new Error(
      `The sibling is not built: ${entry} is missing. Build typedblite-runtime there.`,
    );
  }
  if (git(sibling, 'status', '--porcelain') !== '') {
    throw new Error(
      `The sibling checkout ${sibling} has uncommitted changes; commit or stash them first.`,
    );
  }
  const pkg = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string;
  };

  const rootPackage = join(sibling, 'package.json');
  const licence =
    pkg.license ??
    (existsSync(rootPackage)
      ? (JSON.parse(readFileSync(rootPackage, 'utf8')) as { license?: string }).license
      : undefined);
  if (licence === undefined) {
    throw new Error(
      `Neither ${join(runtime, 'package.json')} nor ${rootPackage} declares a licence; a vendored ` +
        'bundle needs one on record.',
    );
  }

  mkdirSync(directory, { recursive: true });
  const outfile = join(directory, bundleFile);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'silent',
    // Some bundled packages are CommonJS and call `require`; an ES module has none of its own.
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });

  const bytes = readFileSync(outfile);
  const provenance: Provenance = {
    package: pkg.name,
    packageVersion: pkg.version,
    siblingCommit: git(sibling, 'rev-parse', 'HEAD'),
    licence,
    bundle: bundleFile,
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
  writeFileSync(join(directory, provenanceFile), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}
