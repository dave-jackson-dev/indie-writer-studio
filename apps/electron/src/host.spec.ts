import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bootHost, type Host } from './host.js';

const open: Host[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((host) => host.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const boot = async (dataDir?: string): Promise<Host> => {
  const host = await bootHost({ dataDir });
  open.push(host);
  return host;
};

describe('the in-process host', () => {
  it('boots the indie-writer root with every component’s operations', async () => {
    const { runtime } = await boot();
    expect(await runtime.dispatch('system.health', {})).toMatchObject({
      status: 'success',
      data: { status: 'ok', components: ['works', 'manuscript'] },
    });
    expect((await runtime.dispatch('works.work.add', { title: 'Salt Road' })).status).toBe(
      'success',
    );
  });

  it('keeps works across a restart when it is given a data directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'electron-host-'));
    dirs.push(dir);
    const first = await boot(dir);
    await first.runtime.dispatch('works.work.add', { title: 'Salt Road' });
    await first.close();
    open.splice(open.indexOf(first), 1);
    const second = await boot(dir);
    const listed = await second.runtime.dispatch('works.work.list', {});
    expect((listed.data as { works: { title: string }[] }).works.map((w) => w.title)).toEqual([
      'Salt Road',
    ]);
  });

  it('closes the database when it closes, once however often it is asked', async () => {
    const host = await boot();
    await host.close();
    await expect(host.close()).resolves.toBeUndefined();
  });
});
