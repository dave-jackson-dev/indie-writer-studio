import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { FileLock } from '@indie-writer-studio/file-lock';
import type { ManuscriptRepository } from '@indie-writer-studio/manuscript-application';
import {
  MATTERS,
  NODE_KINDS,
  parseWorkId,
  type Manuscript,
} from '@indie-writer-studio/manuscript-domain';

const DIRECTORY = 'manuscripts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNode = (value: unknown): boolean =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  typeof value['title'] === 'string' &&
  typeof value['body'] === 'string' &&
  typeof value['kind'] === 'string' &&
  (NODE_KINDS as readonly string[]).includes(value['kind']) &&
  Array.isArray(value['children']) &&
  value['children'].every(isNode);

/** Throws, naming the problem, unless this is a manuscript for `workId`. */
function check(value: unknown, workId: string): Manuscript {
  if (!isObject(value) || !isObject(value['manuscript'])) throw new Error("no 'manuscript' object");
  const manuscript = value['manuscript'];
  if (manuscript['workId'] !== workId)
    throw new Error(`it belongs to work '${String(manuscript['workId'])}'`);
  if (typeof manuscript['updatedAt'] !== 'string') throw new Error("no 'updatedAt'");
  for (const matter of MATTERS) {
    const nodes = manuscript[matter];
    if (!Array.isArray(nodes) || !nodes.every(isNode))
      throw new Error(`'${matter}' is not a list of nodes`);
  }
  return manuscript as unknown as Manuscript;
}

/**
 * One JSON file per Work under `<dataDir>/manuscripts/`.
 *
 * 🟡 Interim: the long-term store is TypeDBLite. This adapter exists so a single-user app keeps
 * its text across runs behind the same `ManuscriptRepository` port, and is replaced by swapping
 * the adapter, not the callers.
 *
 * 🔴 A file that cannot be read is an error, never an empty manuscript: starting empty and saving
 * would overwrite an author's book. Writers are serialised in this process by a queue and across
 * processes by a lock file per work; files are replaced by rename, so readers need no lock.
 */
export class JsonFileManuscriptRepository implements ManuscriptRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string) {}

  async get(workId: string): Promise<Manuscript | undefined> {
    return this.read(workId);
  }

  async update(
    workId: string,
    change: (current: Manuscript | undefined) => Manuscript,
  ): Promise<Manuscript> {
    return this.write(workId, async (current) => {
      const next = change(current);
      const temporary = `${this.fileOf(workId)}.${process.pid}.tmp`;
      try {
        const handle = await open(temporary, 'w');
        try {
          await handle.writeFile(`${JSON.stringify({ manuscript: next }, null, 2)}\n`);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, this.fileOf(workId));
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
      return next;
    });
  }

  async remove(workId: string): Promise<boolean> {
    return this.write(workId, async (current) => {
      if (current === undefined) return false;
      await rm(this.fileOf(workId), { force: true });
      return true;
    });
  }

  private fileOf(workId: string): string {
    return join(this.dataDir, DIRECTORY, `${parseWorkId(workId)}.json`);
  }

  private async read(workId: string): Promise<Manuscript | undefined> {
    const path = this.fileOf(workId);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      return check(JSON.parse(text), workId);
    } catch (error) {
      throw new Error(
        `${path} could not be read (${(error as Error).message}); it was left untouched.`,
      );
    }
  }

  private write<T>(
    workId: string,
    step: (current: Manuscript | undefined) => Promise<T>,
  ): Promise<T> {
    const path = this.fileOf(workId);
    const lock = new FileLock(`${path.slice(0, -'.json'.length)}.lock`);
    const run = (): Promise<T> =>
      lock.withLock(async () => {
        await mkdir(join(this.dataDir, DIRECTORY), { recursive: true });
        return step(await this.read(workId));
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
