import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { openEngine, type TypeDBLiteEngine } from './engine.js';

/** One result row, as plain values. */
export type Row = Readonly<Record<string, unknown>>;

/** What a read or a write may do. A session is only valid inside the callback that received it. */
export interface Session {
  execute(query: string): Promise<void>;
  query(query: string): Promise<readonly Row[]>;
}

export interface DatabaseOptions {
  /** A file path, or `:memory:` (the default). */
  readonly location?: string | undefined;
  /** Defined in order, so a later schema may refer to an earlier one. Defining twice is harmless. */
  readonly schemas: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * An open TypeDBLite database, with every access in one queue.
 *
 * 🔴 A `SqliteEngine` has one connection and refuses overlapping transactions, and a read that
 * interleaved with a write in flight would see data that may yet roll back. So reads and writes
 * alike wait their turn, and a write is one transaction: all of it or none of it. Writers in other
 * processes are ordered by SQLite itself (`BEGIN IMMEDIATE`, a busy timeout, WAL).
 */
export class Database {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(private readonly engine: TypeDBLiteEngine) {}

  static async open(options: DatabaseOptions): Promise<Database> {
    const location = options.location ?? ':memory:';
    if (location !== ':memory:') await mkdir(dirname(location), { recursive: true });
    const engine = await openEngine(location, options.env);
    try {
      for (const schema of options.schemas) await engine.define(schema);
    } catch (error) {
      await engine.close();
      throw error;
    }
    return new Database(engine);
  }

  private readonly session: Session = {
    execute: async (query) => void (await this.engine.execute(query)),
    query: async (query) =>
      (await this.engine.query(query)).rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([name, value]) => [name, value?.raw])),
      ),
  };

  read<T>(work: (session: Session) => Promise<T>): Promise<T> {
    return this.enqueue(() => work(this.session));
  }

  write<T>(work: (session: Session) => Promise<T>): Promise<T> {
    return this.enqueue(() => this.engine.transaction(() => work(this.session)));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.tail.catch(() => undefined);
    this.closed = true;
    await this.engine.close();
  }

  /** Nest calls this when the application context closes. */
  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The database is closed.'));
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
