import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { FileLock } from './file-lock.js';

const dirs: string[] = [];
const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'file-lock-'));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('FileLock', () => {
  it('runs the function and returns what it returns', async () => {
    const dir = await scratch();
    expect(await new FileLock(join(dir, 'x.lock')).withLock(async () => 42)).toBe(42);
  });

  it('creates the directory the lock lives in', async () => {
    const dir = join(await scratch(), 'nested', 'deeper');
    await new FileLock(join(dir, 'x.lock')).withLock(async () => undefined);
    expect(await readdir(dir)).toEqual([]);
  });

  it('lets one holder at a time in, across instances (as two processes would be)', async () => {
    const dir = await scratch();
    const path = join(dir, 'x.lock');
    let inside = 0;
    let overlapped = false;
    const work = async () => {
      inside += 1;
      if (inside > 1) overlapped = true;
      await sleep(5);
      inside -= 1;
    };
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => new FileLock(path).withLock(work).then(() => i)),
    );
    expect(overlapped).toBe(false);
  });

  it('leaves no lock file behind after success, or after the function throws, and passes the error on', async () => {
    const dir = await scratch();
    const lock = new FileLock(join(dir, 'x.lock'));
    await lock.withLock(async () => undefined);
    await expect(
      lock.withLock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await readdir(dir)).toEqual([]);
  });

  it('never removes a lock that another process now holds (release is ownership-checked)', async () => {
    const dir = await scratch();
    const path = join(dir, 'x.lock');
    await new FileLock(path).withLock(async () => {
      await writeFile(path, 'someone-else');
    });
    expect(await readFile(path, 'utf8')).toBe('someone-else');
  });

  it('breaks a lock left by a crashed process once it is stale', async () => {
    const dir = await scratch();
    const path = join(dir, 'x.lock');
    await writeFile(path, 'crashed');
    const old = new Date(Date.now() - 120_000);
    await utimes(path, old, old);
    expect(await new FileLock(path).withLock(async () => 'ok')).toBe('ok');
    expect(await readdir(dir)).toEqual([]);
  });

  it('applies every critical section when many writers race to break the same stale lock', async () => {
    const dir = await scratch();
    const path = join(dir, 'x.lock');
    const counter = join(dir, 'count');
    await writeFile(counter, '0');
    await writeFile(path, 'crashed');
    const old = new Date(Date.now() - 120_000);
    await utimes(path, old, old);
    await Promise.all(
      Array.from({ length: 12 }, () =>
        new FileLock(path).withLock(async () => {
          const value = Number(await readFile(counter, 'utf8'));
          await sleep(1);
          await writeFile(counter, String(value + 1));
        }),
      ),
    );
    expect(await readFile(counter, 'utf8')).toBe('12');
    expect((await readdir(dir)).sort()).toEqual(['count']);
  });

  it('gives up with a message naming the lock when a live holder keeps it too long', async () => {
    const dir = await scratch();
    const path = join(dir, 'x.lock');
    await writeFile(path, 'alive');
    await expect(
      new FileLock(path, { timeoutMs: 60, staleMs: 60_000 }).withLock(async () => 1),
    ).rejects.toThrow(/x\.lock.*held by another process/);
    expect(await readFile(path, 'utf8')).toBe('alive');
  });
});
