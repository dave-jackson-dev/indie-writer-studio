import { describe, expect, it } from 'vitest';

import { openEngine } from './engine.js';
import { decode, encode } from './literals.js';

const TRICKY = [
  '',
  ' ',
  'plain',
  'with "quotes" and \\ backslashes',
  'line one\nline two\r\nline three\ttabbed',
  '# Salt\n\nThe *first* line.\n  An indented line.\n',
  'unicode: é ü 日本語 🙂',
  'control \u0001 and \u001f and \u007f characters',
  'b: looks like the binary prefix',
  't: looks like the text prefix',
  'x'.repeat(100_000),
];

describe('string literals', () => {
  it.each(TRICKY.map((text) => [JSON.stringify(text).slice(0, 40), text] as const))(
    'round-trips %s through encode and decode',
    (_label, text) => {
      expect(
        decode(
          encode(text)
            .slice(1, -1)
            .replace(/\\(["\\])/g, '$1')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t'),
        ),
      ).toBe(text);
    },
  );

  it('round-trips every tricky string through the real engine, exactly', async () => {
    const engine = await openEngine();
    try {
      await engine.define(
        'define attribute slot, value string; attribute body, value string; entity cell, owns slot @key, owns body;',
      );
      for (const [i, text] of TRICKY.entries()) {
        await engine.execute(
          `insert $c isa cell, has slot ${encode(`s${i}`)}, has body ${encode(text)};`,
        );
      }
      const { rows } = await engine.query(
        'match $c isa cell, has slot $s, has body $b; select $s, $b;',
      );
      const bySlot = new Map(rows.map((row) => [decode(row['s']?.raw), decode(row['b']?.raw)]));
      for (const [i, text] of TRICKY.entries()) expect(bySlot.get(`s${i}`)).toBe(text);
    } finally {
      await engine.close();
    }
  });

  it('keeps an empty string distinct from no value at all', async () => {
    const engine = await openEngine();
    try {
      await engine.define(
        'define attribute slot, value string; attribute body, value string; entity cell, owns slot @key, owns body;',
      );
      await engine.execute(`insert $c isa cell, has slot ${encode('a')}, has body ${encode('')};`);
      await engine.execute(`insert $c isa cell, has slot ${encode('b')};`);
      const { rows } = await engine.query('match $c isa cell, has body $b; select $b;');
      expect(rows).toHaveLength(1);
      expect(decode(rows[0]?.['b']?.raw)).toBe('');
    } finally {
      await engine.close();
    }
  });
});
