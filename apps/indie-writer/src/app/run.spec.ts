import { describe, expect, it } from 'vitest';

import { run } from './run.js';

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
