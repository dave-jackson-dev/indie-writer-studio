/** Characters TypeQL string literals cannot carry (C0 controls and DEL, minus tab, newline, carriage return). */
// eslint-disable-next-line no-control-regex
const UNPRINTABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * A string as a TypeQL literal, quotes included. Text goes in as `t:` + the text with the usual
 * escapes, or, when it holds a control character the dialect cannot carry, as `b:` + base64 of its
 * UTF-8, so what comes back is exactly what went in. The prefix also keeps an empty string distinct
 * from no value at all.
 */
export function encode(text: string): string {
  const stored = UNPRINTABLE.test(text)
    ? `b:${Buffer.from(text, 'utf8').toString('base64')}`
    : `t:${text}`;
  return `"${stored
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/** The text `encode` was given, from a value the engine returned. */
export function decode(raw: unknown): string {
  const stored = String(raw);
  return stored.startsWith('b:')
    ? Buffer.from(stored.slice(2), 'base64').toString('utf8')
    : stored.slice(2);
}

const KEY_MAX = 200;

/**
 * A key (an id) as a TypeQL literal, quotes included, with no prefix so it reads as itself in the
 * database. `undefined` for a key the dialect cannot carry (empty, too long, or holding a control
 * character): no such key can exist, so a lookup of one can simply answer "not found".
 */
export function keyLiteral(key: string): string | undefined {
  if (key === '' || key.length > KEY_MAX || UNPRINTABLE.test(key)) return undefined;
  return `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}
