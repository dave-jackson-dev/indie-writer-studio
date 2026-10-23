import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { WorkRepository } from '@indie-writer-studio/works-application';
import { WORK_STATUSES, type Work } from '@indie-writer-studio/works-domain';

const FILE = 'works.json';
const LOCK = 'works.lock';
/** How long a writer waits for another process before giving up. */
const LOCK_TIMEOUT_MS = 10_000;
/** A lock older than this was left by a process that died holding it. */
const LOCK_STALE_MS = 30_000;

const isWork = (value: unknown): value is Work => {
  if (typeof value !== 'object' || value === null) return false;
  const work = value as Record<string, unknown>;
  return (
    typeof work['id'] === 'string' &&
    typeof work['title'] === 'string' &&
    typeof work['status'] === 'string' &&
    (WORK_STATUSES as readonly string[]).includes(work['status']) &&
    Array.isArray(work['editions'])
  );
};

/**
 * One JSON file holding every Work, in the order they were first saved.
 *
 * 🟡 Interim: the long-term store is TypeDBLite. This adapter exists so a single-user app keeps
 * its works across runs behind the same `WorkRepository` port, and is replaced by swapping the
 * adapter, not the callers.
 *
 * 🔴 A file that cannot be read is an error, never an empty catalog. Starting empty and saving
 * would overwrite an author's works with a catalog of one.
 *
 * 🔴 Writers are serialised twice: in this process by a queue, and across processes by a lock
 * file, because every CLI call is its own process and may run beside a running server. Reads need
 * no lock: the file is replaced by rename, so a reader sees the old file or the new one.
 */
export class JsonFileWorkRepository implements WorkRepository {
  private readonly path: string;
  private readonly lockPath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.path = join(dataDir, FILE);
    this.lockPath = join(dataDir, LOCK);
  }

  async get(id: string): Promise<Work | undefined> {
    return (await this.read()).find((work) => work.id === id);
  }

  async list(): Promise<readonly Work[]> {
    return this.read();
  }

  save(work: Work): Promise<void> {
    return this.write((works) => {
      const index = works.findIndex((candidate) => candidate.id === work.id);
      if (index < 0) works.push(work);
      else works[index] = work;
    });
  }

  update(id: string, change: (work: Work) => Work): Promise<Work | undefined> {
    return this.write((works) => {
      const index = works.findIndex((candidate) => candidate.id === id);
      if (index < 0) return undefined;
      const next = change(works[index] as Work);
      works[index] = next;
      return next;
    });
  }

  remove(id: string): Promise<boolean> {
    return this.write((works) => {
      const index = works.findIndex((candidate) => candidate.id === id);
      if (index < 0) return false;
      works.splice(index, 1);
      return true;
    });
  }

  private async read(): Promise<Work[]> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    try {
      const parsed = JSON.parse(text) as { works?: unknown } | null;
      if (parsed === null || !Array.isArray(parsed.works)) throw new Error("no 'works' array");
      const bad = parsed.works.findIndex((entry) => !isWork(entry));
      if (bad >= 0) throw new Error(`entry ${bad} is not a work`);
      return parsed.works as Work[];
    } catch (error) {
      throw new Error(
        `${this.path} could not be read (${(error as Error).message}); it was left untouched.`,
      );
    }
  }

  private write<T>(change: (works: Work[]) => T): Promise<T> {
    const run = (): Promise<T> =>
      this.withLock(async () => {
        const works = await this.read();
        const result = change(works);
        const temporary = `${this.path}.${process.pid}.tmp`;
        try {
          const handle = await open(temporary, 'w');
          try {
            await handle.writeFile(`${JSON.stringify({ works }, null, 2)}\n`);
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporary, this.path);
        } catch (error) {
          await rm(temporary, { force: true });
          throw error;
        }
        return result;
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async withLock<T>(run: () => Promise<T>): Promise<T> {
    await mkdir(this.dataDir, { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        await writeFile(this.lockPath, String(process.pid), { flag: 'wx' });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const age = await stat(this.lockPath).then(
          (info) => Date.now() - info.mtimeMs,
          () => 0,
        );
        if (age > LOCK_STALE_MS) {
          await rm(this.lockPath, { force: true });
          continue;
        }
        if (Date.now() > deadline) {
          throw new Error(`${this.lockPath} is held by another process; try again.`);
        }
        await sleep(5 + Math.random() * 20);
      }
    }
    try {
      return await run();
    } finally {
      await rm(this.lockPath, { force: true });
    }
  }
}
