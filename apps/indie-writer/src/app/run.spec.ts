import { describe, expect, it } from 'vitest';

import { parseHttpArgs, run } from './run.js';

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (l: string) => out.push(l),
      stderr: (l: string) => err.push(l),
    },
  };
};

describe('indie-writer CLI', () => {
  it('lists system.health in --help without booting Nest', async () => {
    const c = capture();
    expect(await run(['--help'], c.io)).toBe(0);
    expect(c.out.join('\n')).toMatch(/Usage: indie-writer[\s\S]*system\.health/);
  });

  it('dispatches system.health as one operation and prints the envelope', async () => {
    const c = capture();
    expect(await run(['system.health', '--json', '{}'], c.io)).toBe(0);
    expect(JSON.parse(c.out.join(''))).toMatchObject({
      schemaVersion: '1.0.0',
      operation: 'system.health',
      kind: 'query',
      status: 'success',
      exitCode: 0,
      data: { status: 'ok', service: 'indie-writer', components: [] },
    });
  });

  it('refuses an unknown input key by name', async () => {
    const c = capture();
    expect(await run(['system.health', '--bogus', 'x'], c.io)).toBe(2);
    expect(c.out.join('') + c.err.join('')).toContain('bogus');
  });
});

describe('--http arguments', () => {
  it('accepts host, port and repeated cors origins', () => {
    expect(
      parseHttpArgs([
        '--port',
        '0',
        '--host',
        '127.0.0.1',
        '--cors-origin',
        'https://a',
        '--cors-origin',
        'https://b',
      ]),
    ).toEqual({ ok: true, host: '127.0.0.1', port: 0, corsOrigins: ['https://a', 'https://b'] });
  });

  it.each([
    [['--port', 'abc'], /--port must be an integer/],
    [['--port', '70000'], /--port must be an integer/],
    [['--port'], /--port needs a value/],
    [['--host', '--port', '1'], /--host needs a value/],
    [['--cors-orgin', 'x'], /Unknown --http option '--cors-orgin'/],
  ])('refuses %j as a usage error', (args, message) => {
    const parsed = parseHttpArgs(args);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toMatch(message);
  });

  it('exits 2 with a message instead of crashing on a bad port', async () => {
    const c = capture();
    expect(await run(['--http', '--port', 'abc'], c.io)).toBe(2);
    expect(c.err.join('\n')).toContain('--port must be an integer');
  });
});
