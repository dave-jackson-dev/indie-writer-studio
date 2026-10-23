import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bundleFile,
  bundleFromSibling,
  provenanceFile,
  sha256,
  verifyVendored,
  type Provenance,
} from './vendor.js';

const dirs: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'typedblite-vendor-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A stand-in for the lean-agile-os checkout: a built runtime package in a committed repository. */
function sibling(
  options: {
    built?: boolean;
    dirty?: boolean;
    runtimeLicence?: boolean;
    rootLicence?: string;
  } = {},
): string {
  const root = scratch();
  const runtime = join(root, 'libs/core/typedblite/runtime');
  mkdirSync(join(runtime, 'out'), { recursive: true });
  writeFileSync(
    join(runtime, 'package.json'),
    JSON.stringify({
      name: '@lean-agile-os/typedblite-runtime',
      version: '9.9.9',
      ...(options.runtimeLicence === false ? {} : { license: 'MIT' }),
    }),
  );
  if (options.rootLicence) {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', license: options.rootLicence }),
    );
  }
  writeFileSync(join(runtime, 'LICENSE'), 'MIT');
  if (options.built !== false) {
    writeFileSync(join(runtime, 'out/helper.js'), "export const greeting = 'hello';\n");
    writeFileSync(
      join(runtime, 'out/index.js'),
      "import { greeting } from './helper.js';\nexport class SqliteEngine { greet() { return greeting; } }\n",
    );
  }
  git(root, 'init', '-q');
  git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'sibling');
  // The build is newer than the sources it came from, unless the test says a source moved on.
  const long = new Date(Date.now() - 3_600_000);
  const recent = new Date(Date.now() - 1_800_000);
  for (const file of ['package.json', 'LICENSE']) utimesSync(join(runtime, file), long, long);
  if (options.built !== false) {
    for (const file of ['out/helper.js', 'out/index.js'])
      utimesSync(join(runtime, file), recent, recent);
  }
  if (options.staleBuild) {
    writeFileSync(join(runtime, 'LICENSE'), 'MIT (changed)');
    git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-am', 'newer source');
  }
  if (options.dirty) writeFileSync(join(root, 'stray.txt'), 'uncommitted');
  return root;
}

describe('verifyVendored', () => {
  it('accepts a bundle that matches its provenance', async () => {
    const directory = scratch();
    await bundleFromSibling(sibling(), directory);
    expect(verifyVendored(directory)).toEqual({ ok: true });
  });

  it('reports a missing bundle, a missing provenance file and a bundle that was edited', async () => {
    const empty = scratch();
    expect(verifyVendored(empty)).toMatchObject({
      ok: false,
      problem: expect.stringContaining(bundleFile),
    });

    const noProvenance = scratch();
    writeFileSync(join(noProvenance, bundleFile), 'x');
    expect(verifyVendored(noProvenance)).toMatchObject({
      ok: false,
      problem: expect.stringContaining(provenanceFile),
    });

    const edited = scratch();
    await bundleFromSibling(sibling(), edited);
    writeFileSync(
      join(edited, bundleFile),
      `${readFileSync(join(edited, bundleFile), 'utf8')}\n// edited`,
    );
    expect(verifyVendored(edited)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/differs/),
    });
  });
});

describe('bundleFromSibling', () => {
  it('writes one self-contained bundle that loads and exports the engine', async () => {
    const directory = scratch();
    await bundleFromSibling(sibling(), directory);
    const module = (await import(join(directory, bundleFile))) as {
      SqliteEngine: new () => { greet(): string };
    };
    expect(new module.SqliteEngine().greet()).toBe('hello');
  });

  it('records where the bundle came from and its hash', async () => {
    const directory = scratch();
    const root = sibling();
    const provenance = await bundleFromSibling(root, directory);
    const recorded = JSON.parse(
      readFileSync(join(directory, provenanceFile), 'utf8'),
    ) as Provenance;
    expect(recorded).toEqual(provenance);
    expect(recorded).toMatchObject({
      package: '@lean-agile-os/typedblite-runtime',
      packageVersion: '9.9.9',
      siblingCommit: git(root, 'rev-parse', 'HEAD'),
      licence: 'MIT',
      bundle: bundleFile,
    });
    expect(recorded.sha256).toBe(sha256(readFileSync(join(directory, bundleFile))));
    expect(recorded.bytes).toBe(readFileSync(join(directory, bundleFile)).length);
  });

  it('takes the licence from the sibling’s root package when the runtime package declares none', async () => {
    const directory = scratch();
    const provenance = await bundleFromSibling(
      sibling({ runtimeLicence: false, rootLicence: 'Apache-2.0' }),
      directory,
    );
    expect(provenance.licence).toBe('Apache-2.0');
  });

  it('refuses a sibling that declares no licence anywhere, rather than recording UNKNOWN', async () => {
    await expect(bundleFromSibling(sibling({ runtimeLicence: false }), scratch())).rejects.toThrow(
      /licence/i,
    );
  });

  it('refuses a build that is older than the sibling’s sources, so the recorded commit tells the truth', async () => {
    await expect(bundleFromSibling(sibling({ staleBuild: true }), scratch())).rejects.toThrow(
      /older than|stale|rebuild/i,
    );
  });

  it('accepts a build that is newer than every source', async () => {
    await expect(bundleFromSibling(sibling(), scratch())).resolves.toMatchObject({
      package: '@lean-agile-os/typedblite-runtime',
    });
  });

  it('refuses a sibling that is not built', async () => {
    await expect(bundleFromSibling(sibling({ built: false }), scratch())).rejects.toThrow(
      /not built/,
    );
  });

  it('refuses a sibling with uncommitted changes, so the recorded commit tells the truth', async () => {
    await expect(bundleFromSibling(sibling({ dirty: true }), scratch())).rejects.toThrow(
      /uncommitted/,
    );
  });

  it('writes the same bytes twice for the same sibling, so a refresh shows no spurious change', async () => {
    const root = sibling();
    const a = scratch();
    const b = scratch();
    await bundleFromSibling(root, a);
    await bundleFromSibling(root, b);
    expect(readFileSync(join(a, bundleFile))).toEqual(readFileSync(join(b, bundleFile)));
  });
});
