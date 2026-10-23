import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface FileLockOptions {
  /** How long a writer waits for another process before giving up. Default 10 s. */
  readonly timeoutMs?: number;
  /** A lock older than this was left by a process that died holding it. Default 30 s. */
  readonly staleMs?: number;
}

/**
 * A lock between processes, kept as a file. Writers hold it for milliseconds around a
 * read-modify-write; readers need no lock when writers replace files by rename.
 *
 * 🔴 Best effort, as every file lock is. The lock is created exclusively with a per-acquisition
 * token and released only if it still holds that token. A stale lock is renamed aside and
 * discarded only if it is the file that was judged stale (same inode and mtime); a fresh one that
 * got swapped in is put back. What a file lock cannot do is make a holder that stalls past
 * `staleMs` safe: keep the critical section short.
 */
export class FileLock {
  private readonly timeoutMs: number;
  private readonly staleMs: number;

  constructor(
    private readonly path: string,
    options: FileLockOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.staleMs = options.staleMs ?? 30_000;
  }

  async withLock<T>(run: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    const token = `${process.pid}-${randomUUID()}`;
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      if (await this.tryAcquire(token)) break;
      if (!(await this.breakIfStale(token))) {
        if (Date.now() > deadline) {
          throw new Error(`${this.path} is held by another process; try again.`);
        }
        await sleep(5 + Math.random() * 20);
      }
    }
    try {
      return await run();
    } finally {
      await this.release(token);
    }
  }

  /** Creates the lock exclusively. A lock whose token could not be written is not left behind. */
  private async tryAcquire(token: string): Promise<boolean> {
    let handle;
    try {
      handle = await open(this.path, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    try {
      await handle.writeFile(token);
    } catch (error) {
      await handle.close();
      await rm(this.path, { force: true });
      throw error;
    }
    await handle.close();
    return true;
  }

  /** True when the lock is gone (broken, or already released), so acquiring is worth retrying. */
  private async breakIfStale(token: string): Promise<boolean> {
    const seen = await stat(this.path).catch(() => undefined);
    if (seen === undefined) return true;
    if (Date.now() - seen.mtimeMs <= this.staleMs) return false;
    const aside = `${this.path}.${token}.stale`;
    try {
      await rename(this.path, aside);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
    const taken = await stat(aside).catch(() => undefined);
    if (taken !== undefined && (taken.ino !== seen.ino || taken.mtimeMs !== seen.mtimeMs)) {
      await link(aside, this.path).catch(() => undefined);
    }
    await rm(aside, { force: true });
    return true;
  }

  /** Removes the lock only if it is still ours. */
  private async release(token: string): Promise<void> {
    const holder = await readFile(this.path, 'utf8').catch(() => undefined);
    if (holder === token) await rm(this.path, { force: true });
  }
}
