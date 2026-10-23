import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('domain purity', () => {
  it('imports nothing but relative modules (no node:, no third-party)', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const imports = [...readFileSync(join(dir, file), 'utf8').matchAll(/from '([^']+)'/g)].map(
        (m) => m[1],
      );
      for (const specifier of imports) expect(specifier, file).toMatch(/^\./);
    }
  });
});
