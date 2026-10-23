import { describe, expect, it } from 'vitest';

import { openEngine, TypeDBLiteUnavailableError } from './engine.js';

describe('openEngine', () => {
  it('opens an in-memory database on the vendored bundle by default', async () => {
    const engine = await openEngine();
    try {
      await engine.define('define attribute name, value string; entity thing, owns name @key;');
      await engine.execute('insert $t isa thing, has name "a";');
      const { rows } = await engine.query('match $t isa thing, has name $n; select $n;');
      expect(rows.map((row) => row['n']?.raw)).toEqual(['a']);
    } finally {
      await engine.close();
    }
  });

  it('enforces @key uniqueness, the guarantee the store exists for', async () => {
    const engine = await openEngine();
    try {
      await engine.define('define attribute name, value string; entity thing, owns name @key;');
      await engine.execute('insert $t isa thing, has name "a";');
      await expect(engine.execute('insert $t isa thing, has name "a";')).rejects.toThrow(
        /unique|violated/i,
      );
    } finally {
      await engine.close();
    }
  });

  it('names the bundle it could not load and how to point at another', async () => {
    const attempt = openEngine(':memory:', { TYPEDBLITE_BUNDLE: '/no/such/typedblite.mjs' });
    await expect(attempt).rejects.toBeInstanceOf(TypeDBLiteUnavailableError);
    await expect(attempt).rejects.toMatchObject({ code: 'TYPEDBLITE_UNAVAILABLE', exitCode: 10 });
    await expect(attempt).rejects.toThrow(/\/no\/such\/typedblite\.mjs.*TYPEDBLITE_BUNDLE/s);
  });
});
