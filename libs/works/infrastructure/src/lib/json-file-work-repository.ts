import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkRepository } from '@indie-writer-studio/works-application';
import type { Work } from '@indie-writer-studio/works-domain';

const FILE = 'works.json';

/**
 * One JSON file holding every Work, in the order they were first saved.
 *
 * 🟡 Interim: the long-term store is TypeDBLite. This adapter exists so a single-user app keeps
 * its works across runs behind the same `WorkRepository` port, and is replaced by swapping the
 * adapter, not the callers.
 *
 * 🔴 A file that cannot be read is an error, never an empty catalog. Starting empty and saving
 * would overwrite an author's works with a catalog of one.
 */
export class JsonFileWorkRepository implements WorkRepository {
  private readonly path: string;
  /** Serialises writes so two saves in flight cannot interleave their read-modify-write. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.path = join(dataDir, FILE);
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
      return undefined;
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
      const parsed = JSON.parse(text) as { works?: unknown };
      if (!Array.isArray(parsed.works)) throw new Error("no 'works' array");
      return parsed.works as Work[];
    } catch (error) {
      throw new Error(
        `${this.path} could not be read (${(error as Error).message}); it was left untouched.`,
      );
    }
  }

  private write<T>(change: (works: Work[]) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const works = await this.read();
      const result = change(works);
      await mkdir(this.dataDir, { recursive: true });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ works }, null, 2)}\n`);
      await rename(temporary, this.path);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
