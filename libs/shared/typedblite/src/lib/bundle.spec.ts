import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bundlePath, repositoryRoot, vendoredBundlePath } from './bundle.js';

describe('where the TypeDBLite bundle is', () => {
  it('finds the repository root by its nx.json', () => {
    expect(existsSync(join(repositoryRoot(), 'nx.json'))).toBe(true);
  });

  it('uses the vendored bundle by default', () => {
    expect(isAbsolute(vendoredBundlePath())).toBe(true);
    expect(vendoredBundlePath()).toBe(
      join(repositoryRoot(), 'vendor', 'typedblite', 'typedblite.mjs'),
    );
    expect(bundlePath({})).toBe(vendoredBundlePath());
  });

  it('lets TYPEDBLITE_BUNDLE name another bundle', () => {
    expect(bundlePath({ TYPEDBLITE_BUNDLE: '/elsewhere/typedblite.mjs' })).toBe(
      '/elsewhere/typedblite.mjs',
    );
  });

  it('ships the vendored bundle in the repository', () => {
    expect(existsSync(vendoredBundlePath())).toBe(true);
  });
});
